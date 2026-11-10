"""Service configuration, read from environment variables (see docs/environment.md)."""

from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"

    # Supabase
    supabase_url: str = Field(description="Project URL, e.g. https://<ref>.supabase.co")
    supabase_service_role_key: SecretStr
    supabase_db_url: SecretStr
    # Only for projects still on the legacy shared HS256 secret. Projects using asymmetric
    # JWT signing keys are verified against the project's public JWKS instead.
    supabase_jwt_secret: SecretStr | None = None
    jwt_audience: str = "authenticated"

    # HTTP
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:8081"]
    rate_limit_per_minute: int = 60
    rate_limit_expensive_per_minute: int = 10

    # AI providers. Missing keys are reported as "awaiting credentials", never faked.
    anthropic_api_key: SecretStr | None = None
    voyage_api_key: SecretStr | None = None
    elevenlabs_api_key: SecretStr | None = None
    gemini_api_key: SecretStr | None = None
    heygen_api_key: SecretStr | None = None
    # Reading and organising materials (the quality-critical step).
    llm_model: str = "claude-opus-5-5"
    # Transcribing scanned pages and photos.
    llm_vision_model: str = "claude-sonnet-5-5"
    embedding_model: str = "voyage-4"
    embedding_dimensions: int = 1024  # must match the vector(1024) columns
    # Scanned pages read per material; pages past the cap are skipped and reported to the user.
    ocr_max_pages: int = 300

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("supabase_url")
    @classmethod
    def _strip_slash(cls, value: str) -> str:
        return value.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
