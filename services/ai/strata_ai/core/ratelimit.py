"""Per-user token-bucket rate limiting.

In-memory, so limits apply per API instance. When the API runs on more than one instance,
swap the store for Redis or Postgres; the dependency interface stays the same.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from threading import Lock

from fastapi import HTTPException, Request, status

from strata_ai.core.auth import AuthUser, CurrentUser


@dataclass
class _Bucket:
    tokens: float
    updated: float = field(default_factory=time.monotonic)


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._buckets: dict[tuple[str, str], _Bucket] = {}
        self._lock = Lock()
        self._clock = clock

    def take(self, key: tuple[str, str], per_minute: int) -> float:
        """Consume one token. Returns 0 when allowed, otherwise seconds until the next token."""
        rate = per_minute / 60.0
        now = self._clock()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = self._buckets[key] = _Bucket(tokens=float(per_minute), updated=now)
            bucket.tokens = min(float(per_minute), bucket.tokens + (now - bucket.updated) * rate)
            bucket.updated = now
            if bucket.tokens >= 1:
                bucket.tokens -= 1
                return 0.0
            return (1 - bucket.tokens) / rate


def rate_limit(scope: str, expensive: bool = False) -> Callable[..., AuthUser]:
    """Dependency factory: authenticates the caller and charges one request to their bucket."""

    def dependency(request: Request, user: CurrentUser) -> AuthUser:
        settings = request.app.state.settings
        limit = settings.rate_limit_expensive_per_minute if expensive else settings.rate_limit_per_minute
        wait = request.app.state.rate_limiter.take((user.id, scope), limit)
        if wait > 0:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests. Please slow down.",
                headers={"Retry-After": str(max(1, round(wait)))},
            )
        return user

    return dependency
