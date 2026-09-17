"""
Verifying the Supabase session JWT that the Next.js proxy forwards.

The service talks to Postgres directly, so row-level security is not what keeps
one user out of another's books here — the `user_id` read from a verified token
is, on every query. That makes this the one check everything else rests on, and
the reason it accepts nothing it cannot verify against this project's keys:
a token signed by another Supabase project has a different issuer and an
unknown key id, and fails on both.

Two signing schemes exist in the wild. Newer projects publish asymmetric keys
(JWKS); legacy projects sign with a shared HS256 secret. The token's own header
says which, and each is checked against the matching source only — an HS256
token is never verified against a JWKS key, or the other way round.
"""

from typing import Annotated, Protocol

import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient

from app.config import Settings, get_settings

# Supabase issues session tokens for the `authenticated` audience.
AUDIENCE = "authenticated"
ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]


class SigningKeyResolver(Protocol):
    """The one method of `PyJWKClient` the verifier uses; a test can hand in a stub."""

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK: ...


class AuthError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class TokenVerifier:
    def __init__(
        self,
        *,
        issuer: str,
        hs256_secret: str | None,
        jwks: SigningKeyResolver | None,
    ) -> None:
        self._issuer = issuer
        self._hs256_secret = hs256_secret
        self._jwks = jwks

    def user_id(self, token: str) -> str:
        """Returns the token's `sub`, or raises `AuthError` saying why not."""
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as e:
            raise AuthError("Malformed token.") from e

        alg = header.get("alg")
        try:
            if alg == "HS256":
                if self._hs256_secret is None:
                    raise AuthError("HS256 token but no SUPABASE_JWT_SECRET is configured.")
                claims = jwt.decode(
                    token,
                    self._hs256_secret,
                    algorithms=["HS256"],
                    audience=AUDIENCE,
                    issuer=self._issuer,
                )
            elif alg in ASYMMETRIC_ALGORITHMS:
                if self._jwks is None:
                    raise AuthError("Asymmetric token but no JWKS source is configured.")
                key = self._jwks.get_signing_key_from_jwt(token)
                claims = jwt.decode(
                    token,
                    key.key,
                    algorithms=ASYMMETRIC_ALGORITHMS,
                    audience=AUDIENCE,
                    issuer=self._issuer,
                )
            else:
                raise AuthError(f"Unsupported token algorithm {alg!r}.")
        except jwt.ExpiredSignatureError as e:
            raise AuthError("Session expired. Sign in again.") from e
        except jwt.PyJWTError as e:
            # Wrong issuer, unknown key id, bad signature, wrong audience: all
            # the same answer, and the detail stays in the log, not the reply.
            raise AuthError("Token could not be verified.") from e

        sub = claims.get("sub")
        if not isinstance(sub, str) or sub == "":
            raise AuthError("Token carries no user id.")
        return sub


def build_verifier(settings: Settings) -> TokenVerifier:
    return TokenVerifier(
        issuer=settings.jwt_issuer,
        hs256_secret=settings.supabase_jwt_secret,
        # Caches keys and refetches on an unknown key id, so a key rotation on
        # the Supabase side is picked up without a restart.
        jwks=PyJWKClient(settings.jwks_url, cache_keys=True),
    )


def get_verifier(request: Request) -> TokenVerifier:
    verifier = getattr(request.app.state, "verifier", None)
    if verifier is None:
        verifier = build_verifier(get_settings())
        request.app.state.verifier = verifier
    return verifier


def require_user(
    request: Request,
    verifier: Annotated[TokenVerifier, Depends(get_verifier)],
) -> str:
    """FastAPI dependency: the verified user id, or a 401."""
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token == "":
        raise HTTPException(status_code=401, detail="Sign in to use book import.")
    try:
        return verifier.user_id(token)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=e.message) from e


CurrentUser = Annotated[str, Depends(require_user)]
