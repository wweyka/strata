import os
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from strata_ai.core.config import Settings
from strata_ai.main import create_app

SECRET = "test-secret-with-at-least-thirty-two-characters"
USER_ID = "4f7d1a52-9a51-4f8e-b8a3-0d1f6f1a2b3c"


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "supabase_url": "http://supabase.test",
        "supabase_service_role_key": "service-role-key",
        "supabase_db_url": os.environ.get("STRATA_TEST_DB_URL", "postgresql://localhost:1/none"),
        "supabase_jwt_secret": SECRET,
        "_env_file": None,
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


def make_token(
    sub: str = USER_ID,
    role: str = "authenticated",
    aud: str = "authenticated",
    ttl: int = 3600,
    **extra: object,
) -> str:
    now = int(time.time())
    claims = {"sub": sub, "role": role, "aud": aud, "iat": now, "exp": now + ttl, "email": "a@example.com"}
    claims.update(extra)
    return jwt.encode(claims, SECRET, algorithm="HS256")


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def client(settings: Settings) -> TestClient:
    # No context manager: the lifespan (database pool) is not started for HTTP-only tests.
    return TestClient(create_app(settings))


def auth(token: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {token or make_token()}"}
