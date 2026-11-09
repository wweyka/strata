"""Supabase session verification. The API acts as the signed-in user it receives."""

from dataclasses import dataclass
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from strata_ai.core.config import Settings


class InvalidTokenError(Exception):
    pass


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    token: str


class TokenVerifier:
    """Verifies Supabase access tokens.

    New projects sign with asymmetric keys (ES256/RS256) published at the project's JWKS
    endpoint; older projects use a shared HS256 secret. Both are supported.
    """

    def __init__(self, settings: Settings) -> None:
        secret = settings.supabase_jwt_secret
        self._secret = secret.get_secret_value() if secret else None
        self._audience = settings.jwt_audience
        self._jwks = jwt.PyJWKClient(
            f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600
        )

    def verify(self, token: str) -> dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise InvalidTokenError("malformed token") from exc
        algorithm = header.get("alg")
        key: Any
        if algorithm == "HS256":
            if not self._secret:
                raise InvalidTokenError("HS256 tokens require SUPABASE_JWT_SECRET")
            key = self._secret
        elif algorithm in ("ES256", "RS256"):
            try:
                key = self._jwks.get_signing_key_from_jwt(token).key
            except jwt.PyJWTError as exc:
                raise InvalidTokenError("unknown signing key") from exc
        else:
            raise InvalidTokenError("unsupported algorithm")
        try:
            return jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience=self._audience,
                options={"require": ["exp", "sub", "aud"]},
            )
        except jwt.PyJWTError as exc:
            raise InvalidTokenError(str(exc)) from exc


_bearer = HTTPBearer(auto_error=False)


def current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthUser:
    """FastAPI dependency: the signed-in Supabase user, or 401."""
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    verifier: TokenVerifier = request.app.state.verifier
    try:
        claims = verifier.verify(credentials.credentials)
    except InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session is invalid or has expired.") from exc
    if claims.get("role") != "authenticated":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A signed-in user is required.")
    return AuthUser(id=str(claims["sub"]), email=claims.get("email"), token=credentials.credentials)


CurrentUser = Annotated[AuthUser, Depends(current_user)]
