"""FastAPI application entry point: `uvicorn strata_ai.main:app`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from strata_ai.api.routes import router
from strata_ai.core.auth import TokenVerifier
from strata_ai.core.config import Settings, get_settings
from strata_ai.core.db import create_pool
from strata_ai.core.ratelimit import RateLimiter
from strata_ai.core.supabase_admin import SupabaseAdmin


def create_app(settings: Settings | None = None, admin: SupabaseAdmin | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        pool = create_pool(settings.supabase_db_url.get_secret_value())
        await pool.open(wait=False)
        app.state.pool = pool
        try:
            yield
        finally:
            await pool.close()
            await app.state.admin.aclose()

    app = FastAPI(
        title="Strata AI",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.environment == "development" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.environment == "development" else None,
    )
    app.state.settings = settings
    app.state.verifier = TokenVerifier(settings)
    app.state.rate_limiter = RateLimiter()
    app.state.admin = admin or SupabaseAdmin(
        settings.supabase_url, settings.supabase_service_role_key.get_secret_value()
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    app.include_router(router)
    return app


def __getattr__(name: str) -> FastAPI:
    # Built lazily so importing this module (e.g. in tests) does not require configuration.
    if name == "app":
        return create_app()
    raise AttributeError(name)
