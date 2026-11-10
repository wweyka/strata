"""Claude and Voyage adapters against fake transports: no network, no keys."""

import json
from types import SimpleNamespace

import httpx
import pytest
from pydantic import BaseModel

from strata_ai.providers import voyage as voyage_module
from strata_ai.providers.claude import Claude, LLMUsage, ModelRefused, OutputTruncated, estimate_cost
from strata_ai.providers.voyage import EmbeddingAuthError, EmbeddingError, Voyage, batches


class Answer(BaseModel):
    title: str


class FakeStream:
    def __init__(self, message):
        self.message = message

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get_final_message(self):
        return self.message


class FakeClient:
    def __init__(self, message):
        self.calls: list[dict] = []
        self.messages = SimpleNamespace(stream=self._stream)
        self.message = message

    def _stream(self, **kwargs):
        self.calls.append(kwargs)
        return FakeStream(self.message)


def _message(text: str, stop: str = "end_turn"):
    usage = SimpleNamespace(
        input_tokens=1000, output_tokens=200, cache_read_input_tokens=500, cache_creation_input_tokens=0
    )
    return SimpleNamespace(stop_reason=stop, content=[SimpleNamespace(type="text", text=text)], usage=usage)


async def test_structured_answer_is_validated_and_recorded():
    recorded: list[LLMUsage] = []

    async def sink(usage):
        recorded.append(usage)

    client = FakeClient(_message('{"title": "Subnetting"}'))
    claude = Claude("unused", "claude-opus-5-5", "claude-sonnet-5-5", sink, client=client)  # type: ignore[arg-type]
    answer = await claude.structured(operation="analyse_window", system="sys", content="hi", output=Answer)
    assert answer == Answer(title="Subnetting")
    call = client.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    (usage,) = recorded
    assert (usage.operation, usage.status, usage.input_tokens, usage.cache_read_tokens) == (
        "analyse_window",
        "ok",
        1000,
        500,
    )
    assert usage.cost_usd == pytest.approx((1000 * 4 + 200 * 20 + 500 * 0.2) / 1_000_000)


async def test_refusal_and_truncation_are_errors_not_answers():
    recorded: list[LLMUsage] = []

    async def sink(usage):
        recorded.append(usage)

    refused = Claude("k", "m", "v", sink, client=FakeClient(_message("", stop="refusal")))  # type: ignore[arg-type]
    with pytest.raises(ModelRefused):
        await refused.structured(operation="op", system="s", content="c", output=Answer)
    assert [u.status for u in recorded] == ["refused"]

    cut = Claude("k", "m", "v", None, client=FakeClient(_message('{"tit', stop="max_tokens")))  # type: ignore[arg-type]
    with pytest.raises(OutputTruncated):
        await cut.structured(operation="op", system="s", content="c", output=Answer)


def test_unknown_model_has_no_invented_price():
    assert estimate_cost("some-other-model", SimpleNamespace(input_tokens=1, output_tokens=1)) is None


def test_batches_respect_item_and_token_caps(monkeypatch):
    monkeypatch.setattr(voyage_module, "MAX_BATCH_TOKENS", 100)
    texts = ["x" * 140] * 5  # about 41 tokens each
    assert batches(texts) == [[0, 1], [2, 3], [4]]
    monkeypatch.undo()
    assert sum(len(group) for group in batches(["a"] * 300)) == 300
    assert max(len(group) for group in batches(["a"] * 300)) == voyage_module.MAX_BATCH_ITEMS


async def test_voyage_embeds_in_order_and_retries_rate_limits(monkeypatch):
    monkeypatch.setattr(voyage_module.asyncio, "sleep", _no_sleep)
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        if len(calls) == 1:
            return httpx.Response(429, json={"detail": "slow down"})
        data = [{"index": i, "embedding": [float(i), 1.0, 0.0]} for i in range(len(body["input"]))]
        return httpx.Response(200, json={"data": list(reversed(data)), "usage": {"total_tokens": 7}})

    recorded: list[LLMUsage] = []

    async def sink(usage):
        recorded.append(usage)

    client = Voyage("key", "voyage-4", 3, sink, transport=httpx.MockTransport(handler))
    vectors = await client.embed(["a", "b", "c"], kind="document")
    assert vectors == [[0.0, 1.0, 0.0], [1.0, 1.0, 0.0], [2.0, 1.0, 0.0]]
    assert calls[-1] == {
        "input": ["a", "b", "c"],
        "model": "voyage-4",
        "input_type": "document",
        "output_dimension": 3,
    }
    assert [u.status for u in recorded] == ["error", "ok"] and recorded[-1].input_tokens == 7


async def test_voyage_rejected_key_and_wrong_dimensions():
    rejected = Voyage(
        "bad", "voyage-4", 3, transport=httpx.MockTransport(lambda r: httpx.Response(401, json={}))
    )
    with pytest.raises(EmbeddingAuthError):
        await rejected.embed(["a"], kind="query")

    def wrong(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [1.0]}], "usage": {}})

    with pytest.raises(EmbeddingError):
        await Voyage("k", "voyage-4", 3, transport=httpx.MockTransport(wrong)).embed(["a"], kind="query")


async def _no_sleep(_seconds: float) -> None:
    return None
