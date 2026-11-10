"""Anthropic Claude adapter: structured answers that are validated before the pipeline uses them.

Every call is streamed (long documents mean long outputs) and recorded in the usage ledger.
"""

import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Any, TypeVar

import anthropic
from anthropic import AsyncAnthropic, transform_schema
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

# USD per million tokens: (input, output, cache read, cache write). Used for the usage ledger only.
PRICES: dict[str, tuple[float, float, float, float]] = {
    "claude-opus-5-5": (4.0, 20.0, 0.20, 5.0),
    "claude-sonnet-5-5": (2.0, 10.0, 0.10, 2.5),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
}


@dataclass(frozen=True)
class LLMUsage:
    provider: str
    model: str
    operation: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    latency_ms: int
    status: str
    cost_usd: float | None


UsageSink = Callable[[LLMUsage], Awaitable[None]]


class ModelRefused(RuntimeError):
    """The model declined the request; retrying the same input will not help."""


class OutputTruncated(RuntimeError):
    """The answer hit max_tokens before it was complete."""


def estimate_cost(model: str, usage: Any) -> float | None:
    price = PRICES.get(model)
    if price is None:
        return None
    p_in, p_out, p_read, p_write = price
    cost = (
        usage.input_tokens * p_in
        + usage.output_tokens * p_out
        + (getattr(usage, "cache_read_input_tokens", 0) or 0) * p_read
        + (getattr(usage, "cache_creation_input_tokens", 0) or 0) * p_write
    )
    return round(cost / 1_000_000, 6)


class Claude:
    """Structured JSON answers from Claude, parsed into pydantic models."""

    def __init__(
        self,
        api_key: str,
        model: str,
        vision_model: str,
        usage_sink: UsageSink | None = None,
        client: AsyncAnthropic | None = None,
    ) -> None:
        self.model = model
        self.vision_model = vision_model
        self._usage_sink = usage_sink
        self._client = client or AsyncAnthropic(api_key=api_key, max_retries=4, timeout=900.0)

    async def aclose(self) -> None:
        await self._client.close()

    async def structured(
        self,
        *,
        operation: str,
        system: str,
        content: str | Sequence[dict[str, Any]],
        output: type[T],
        model: str | None = None,
        max_tokens: int = 32000,
        effort: str = "medium",
    ) -> T:
        """Ask for an answer matching `output`'s JSON schema and return it validated."""
        chosen = model or self.model
        schema = transform_schema(output.model_json_schema())
        started = time.monotonic()
        try:
            async with self._client.messages.stream(
                model=chosen,
                max_tokens=max_tokens,
                # The system prompt is identical for every call of an operation, so it caches.
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": content}],
                output_config={"format": {"type": "json_schema", "schema": schema}, "effort": effort},
            ) as stream:
                message = await stream.get_final_message()
        except anthropic.APITimeoutError:
            await self._record(chosen, operation, None, started, "timeout")
            raise
        except anthropic.APIError:
            await self._record(chosen, operation, None, started, "error")
            raise

        refused = message.stop_reason == "refusal"
        await self._record(chosen, operation, message, started, "refused" if refused else "ok")
        if refused:
            raise ModelRefused(f"{operation}: the model declined this input")
        if message.stop_reason == "max_tokens":
            raise OutputTruncated(f"{operation}: answer exceeded {max_tokens} tokens")
        text = next((block.text for block in message.content if block.type == "text"), None)
        if text is None:
            raise OutputTruncated(f"{operation}: no answer text")
        return output.model_validate_json(text)

    async def _record(self, model: str, operation: str, message: Any, started: float, status: str) -> None:
        if self._usage_sink is None:
            return
        usage = getattr(message, "usage", None)
        await self._usage_sink(
            LLMUsage(
                provider="anthropic",
                model=model,
                operation=operation,
                input_tokens=getattr(usage, "input_tokens", 0) or 0,
                output_tokens=getattr(usage, "output_tokens", 0) or 0,
                cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
                cache_write_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
                latency_ms=int((time.monotonic() - started) * 1000),
                status=status,
                cost_usd=estimate_cost(model, usage) if usage is not None else None,
            )
        )
