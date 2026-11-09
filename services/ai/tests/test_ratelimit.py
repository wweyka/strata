from fastapi.testclient import TestClient

from strata_ai.core.ratelimit import RateLimiter
from strata_ai.main import create_app
from tests.conftest import auth, make_settings, make_token


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_bucket_refills_over_time():
    clock = FakeClock()
    limiter = RateLimiter(clock)
    key = ("user", "scope")
    assert all(limiter.take(key, 2) == 0 for _ in range(2))
    wait = limiter.take(key, 2)
    assert 29 < wait <= 30
    clock.now += 30
    assert limiter.take(key, 2) == 0


def test_buckets_are_per_user_and_scope():
    limiter = RateLimiter(FakeClock())
    assert limiter.take(("a", "x"), 1) == 0
    assert limiter.take(("a", "x"), 1) > 0
    assert limiter.take(("b", "x"), 1) == 0
    assert limiter.take(("a", "y"), 1) == 0


def test_endpoint_returns_429_with_retry_after():
    client = TestClient(create_app(make_settings(rate_limit_per_minute=2)))
    headers = auth()
    assert client.get("/v1/capabilities", headers=headers).status_code == 200
    assert client.get("/v1/capabilities", headers=headers).status_code == 200
    limited = client.get("/v1/capabilities", headers=headers)
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) >= 1
    # Another user is unaffected.
    other = auth(make_token(sub="0b6c1d9e-1111-4c2a-9a55-2b1e7b9c0d11"))
    assert client.get("/v1/capabilities", headers=other).status_code == 200
