"""HTTP routes. Reads and writes the user can do under RLS go straight to Supabase from the
app; this service only handles what needs the service role or a provider key."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from strata_ai.core.auth import AuthUser
from strata_ai.core.ratelimit import rate_limit
from strata_ai.core.supabase_admin import SupabaseAdmin, SupabaseAdminError
from strata_ai.providers.registry import capability_status

log = logging.getLogger(__name__)
router = APIRouter()

CapabilitiesCaller = Annotated[AuthUser, Depends(rate_limit("capabilities"))]
AccountDeletionCaller = Annotated[AuthUser, Depends(rate_limit("delete_account", expensive=True))]


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    database = "ok"
    try:
        async with request.app.state.pool.connection(timeout=3) as conn:
            await conn.execute("select 1")
    except Exception:  # noqa: BLE001 - any failure means the database is unreachable
        log.exception("health check: database unreachable")
        database = "unavailable"
    if database != "ok":
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, {"status": "degraded", "database": database})
    return {"status": "ok", "database": database}


@router.get("/v1/capabilities")
async def capabilities(request: Request, user: CapabilitiesCaller) -> dict[str, object]:
    """Which AI features are live. Features without credentials report awaiting_credentials."""
    return {"capabilities": capability_status(request.app.state.settings)}


@router.delete("/v1/account", status_code=status.HTTP_200_OK)
async def delete_account(request: Request, user: AccountDeletionCaller) -> dict[str, object]:
    """Permanently delete the caller's account, every uploaded file and all derived data."""
    admin: SupabaseAdmin = request.app.state.admin
    try:
        removed = await admin.delete_user_and_files(user.id)
    except SupabaseAdminError:
        log.exception("account deletion failed for %s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "We could not delete your account right now. Please try again."
        ) from None
    log.info("deleted account %s and %d files", user.id, removed)
    return {"deleted": True, "files_removed": removed}
