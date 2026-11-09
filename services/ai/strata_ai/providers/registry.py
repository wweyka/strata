"""Which AI capabilities are usable right now, based on the credentials the service holds."""

from dataclasses import dataclass
from typing import Literal

from strata_ai.core.config import Settings

Status = Literal["ready", "awaiting_credentials"]


@dataclass(frozen=True)
class Capability:
    key: str
    purpose: str
    provider: str
    env_var: str
    required: bool
    phase: int


CAPABILITIES: tuple[Capability, ...] = (
    Capability(
        "llm",
        "Knowledge extraction, scripts, quizzes, tutor, fact checks",
        "Anthropic Claude",
        "ANTHROPIC_API_KEY",
        True,
        2,
    ),
    Capability("embeddings", "Semantic search and topic merging", "Voyage AI", "VOYAGE_API_KEY", True, 2),
    Capability("rerank", "Grounded retrieval for the tutor", "Voyage AI", "VOYAGE_API_KEY", True, 2),
    Capability("speech", "Video narration with word timings", "ElevenLabs", "ELEVENLABS_API_KEY", True, 3),
    Capability("images", "Illustrated video scenes", "Google Gemini", "GEMINI_API_KEY", False, 3),
    Capability("video_clips", "Optional illustrative b-roll", "Google Veo", "GEMINI_API_KEY", False, 3),
    Capability("avatar", "Optional virtual instructor style", "HeyGen", "HEYGEN_API_KEY", False, 3),
)


def _has(settings: Settings, env_var: str) -> bool:
    secret = getattr(settings, env_var.lower(), None)
    return bool(secret and secret.get_secret_value().strip())


def capability_status(settings: Settings) -> list[dict[str, object]]:
    return [
        {
            "key": cap.key,
            "purpose": cap.purpose,
            "provider": cap.provider,
            "required": cap.required,
            "phase": cap.phase,
            "status": "ready" if _has(settings, cap.env_var) else "awaiting_credentials",
            # The variable name tells an operator what to configure; the value is never returned.
            "env_var": cap.env_var,
        }
        for cap in CAPABILITIES
    ]
