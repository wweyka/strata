"""Provider interfaces. Each AI capability is a small protocol so vendors can be swapped
without touching the pipeline. Concrete adapters land with the phase that first needs them."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


class ProviderNotConfigured(RuntimeError):
    """Raised when a capability is used before its credentials are set.

    Callers surface this as "awaiting credentials". Nothing is ever simulated in its place.
    """

    def __init__(self, capability: str, env_var: str) -> None:
        super().__init__(f"{capability} is awaiting credentials: set {env_var} on the AI service")
        self.capability = capability
        self.env_var = env_var


@dataclass(frozen=True)
class Narration:
    audio: bytes
    mime_type: str
    # (word, start_seconds, end_seconds) for captions and scene timing
    word_timings: Sequence[tuple[str, float, float]]


class LanguageModel(Protocol):
    async def complete_json(self, system: str, prompt: str, schema: dict) -> dict: ...


class Embedder(Protocol):
    dimensions: int

    async def embed(self, texts: Sequence[str], *, kind: str) -> list[list[float]]: ...


class Reranker(Protocol):
    async def rerank(self, query: str, documents: Sequence[str], top_k: int) -> list[int]: ...


class SpeechSynthesizer(Protocol):
    async def narrate(self, text: str, *, language: str, voice: str | None = None) -> Narration: ...


class ImageGenerator(Protocol):
    async def generate(self, prompt: str, *, aspect_ratio: str) -> bytes: ...


class VideoClipGenerator(Protocol):
    async def generate(self, prompt: str, *, seconds: int, aspect_ratio: str) -> bytes: ...


class AvatarPresenter(Protocol):
    async def present(self, script: str, *, language: str, avatar: str | None = None) -> bytes: ...
