"""Voyage AI embeddings over plain HTTPS (POST /v1/embeddings)."""

import asyncio
import time
from collections.abc import Awaitable, Callable, Sequence
from typing import Literal

import httpx

from strata_ai.providers.claude import LLMUsage

API_URL = "https://api.voyageai.com/v1/embeddings"
MAX_BATCH_ITEMS = 128
# Voyage caps each request at 320K tokens for voyage-4 / voyage-3.5; stay well under it.
MAX_BATCH_TOKENS = 100_000


class EmbeddingError(RuntimeError):
    pass


class EmbeddingAuthError(EmbeddingError):
    """The key was rejected (401/403): retrying will not help until it is fixed."""


def estimate_tokens(text: str) -> int:
    """A deliberately high estimate (about 3.5 characters a token) used for batching."""
    return max(1, int(len(text) / 3.5) + 1)


def batches(texts: Sequence[str]) -> list[list[int]]:
    """Indexes of `texts` grouped so each request stays under the item and token caps."""
    groups: list[list[int]] = []
    current: list[int] = []
    tokens = 0
    for index, text in enumerate(texts):
        cost = estimate_tokens(text)
        if current and (len(current) >= MAX_BATCH_ITEMS or tokens + cost > MAX_BATCH_TOKENS):
            groups.append(current)
            current, tokens = [], 0
        current.append(index)
        tokens += cost
    if current:
        groups.append(current)
    return groups


class Voyage:
    def __init__(
        self,
        api_key: str,
        model: str,
        dimensions: int,
        usage_sink: Callable[[LLMUsage], Awaitable[None]] | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.model = model
        self.dimensions = dimensions
        self._usage_sink = usage_sink
        self._client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {api_key}"}, timeout=120.0, transport=transport
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def embed(self, texts: Sequence[str], *, kind: Literal["document", "query"]) -> list[list[float]]:
        vectors: list[list[float] | None] = [None] * len(texts)
        for group in batches(texts):
            result = await self._request([texts[i] for i in group], kind)
            for offset, vector in enumerate(result):
                vectors[group[offset]] = vector
        if any(v is None for v in vectors):
            raise EmbeddingError("Voyage did not return a vector for every input")
        return [v for v in vectors if v is not None]

    async def _request(self, inputs: list[str], kind: str) -> list[list[float]]:
        body = {
            "input": inputs,
            "model": self.model,
            "input_type": kind,
            "output_dimension": self.dimensions,
        }
        delay = 2.0
        for attempt in range(5):
            started = time.monotonic()
            response = await self._client.post(API_URL, json=body)
            if response.status_code == 429 or response.status_code >= 500:
                await self._record(0, started, "error")
                if attempt == 4:
                    break
                await asyncio.sleep(delay)
                delay *= 2
                continue
            if response.status_code in (401, 403):
                await self._record(0, started, "error")
                raise EmbeddingAuthError(f"Voyage rejected the API key ({response.status_code})")
            if response.is_error:
                await self._record(0, started, "error")
                raise EmbeddingError(f"Voyage returned {response.status_code}: {response.text[:200]}")
            payload = response.json()
            await self._record(int(payload.get("usage", {}).get("total_tokens", 0)), started, "ok")
            data = sorted(payload["data"], key=lambda item: item["index"])
            vectors = [item["embedding"] for item in data]
            if len(vectors) != len(inputs) or any(len(v) != self.dimensions for v in vectors):
                raise EmbeddingError("Voyage returned an unexpected number or size of vectors")
            return vectors
        raise EmbeddingError(f"Voyage kept failing ({response.status_code})")

    async def _record(self, tokens: int, started: float, status: str) -> None:
        if self._usage_sink is None:
            return
        await self._usage_sink(
            LLMUsage(
                provider="voyage",
                model=self.model,
                operation="embed",
                input_tokens=tokens,
                output_tokens=0,
                cache_read_tokens=0,
                cache_write_tokens=0,
                latency_ms=int((time.monotonic() - started) * 1000),
                status=status,
                cost_usd=None,  # billed by Voyage; tokens are what the ledger can vouch for
            )
        )
