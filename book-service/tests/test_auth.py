import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.auth import AUDIENCE, AuthError, TokenVerifier
from app.config import Settings
from app.main import create_app

ISSUER = "https://this-project.supabase.co/auth/v1"
OTHER_ISSUER = "https://other-project.supabase.co/auth/v1"
SECRET = "legacy-shared-secret-for-tests-at-least-32-bytes-long"
USER = "8d1c2a2e-4a1b-4c0e-9d1a-000000000001"


class StubJwks:
    """Stands in for PyJWKClient: knows one project's key by its `kid`."""

    def __init__(self, kid: str, public_key) -> None:
        self._kid = kid
        self._key = public_key

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        header = jwt.get_unverified_header(token)
        if header.get("kid") != self._kid:
            raise jwt.PyJWKClientError(
                f"Unable to find a signing key for kid {header.get('kid')!r}"
            )
        return _KeyWrapper(self._key)


class _KeyWrapper:
    def __init__(self, key) -> None:
        self.key = key


@pytest.fixture
def es256_keys():
    private = ec.generate_private_key(ec.SECP256R1())
    return private, private.public_key()


@pytest.fixture
def verifier(es256_keys) -> TokenVerifier:
    _, public = es256_keys
    return TokenVerifier(
        issuer=ISSUER,
        hs256_secret=SECRET,
        jwks=StubJwks(kid="this-project-kid", public_key=public),
    )


def make_token(
    *,
    private_key,
    kid: str = "this-project-kid",
    issuer: str = ISSUER,
    sub: str = USER,
    expires_in: int = 3600,
    audience: str = AUDIENCE,
) -> str:
    now = int(time.time())
    claims = {"sub": sub, "aud": audience, "iss": issuer, "iat": now, "exp": now + expires_in}
    return jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": kid})


def make_hs256_token(*, secret: str = SECRET, issuer: str = ISSUER, expires_in: int = 3600) -> str:
    now = int(time.time())
    claims = {"sub": USER, "aud": AUDIENCE, "iss": issuer, "iat": now, "exp": now + expires_in}
    return jwt.encode(claims, secret, algorithm="HS256")


def test_valid_asymmetric_token_yields_user_id(verifier, es256_keys):
    private, _ = es256_keys
    assert verifier.user_id(make_token(private_key=private)) == USER


def test_valid_hs256_token_yields_user_id(verifier):
    assert verifier.user_id(make_hs256_token()) == USER


def test_expired_token_is_rejected_with_a_session_message(verifier, es256_keys):
    private, _ = es256_keys
    with pytest.raises(AuthError, match="expired"):
        verifier.user_id(make_token(private_key=private, expires_in=-60))


def test_token_from_another_project_is_rejected(verifier, es256_keys):
    """Another project: different issuer and a key id this project's JWKS lacks."""
    other_private = ec.generate_private_key(ec.SECP256R1())
    token = make_token(private_key=other_private, kid="other-project-kid", issuer=OTHER_ISSUER)
    with pytest.raises(AuthError, match="could not be verified"):
        verifier.user_id(token)


def test_right_key_wrong_issuer_is_rejected(verifier, es256_keys):
    private, _ = es256_keys
    with pytest.raises(AuthError, match="could not be verified"):
        verifier.user_id(make_token(private_key=private, issuer=OTHER_ISSUER))


def test_hs256_token_with_wrong_secret_is_rejected(verifier):
    with pytest.raises(AuthError, match="could not be verified"):
        verifier.user_id(make_hs256_token(secret="not-the-secret-but-also-32-bytes-long!!"))


def test_wrong_audience_is_rejected(verifier, es256_keys):
    private, _ = es256_keys
    with pytest.raises(AuthError, match="could not be verified"):
        verifier.user_id(make_token(private_key=private, audience="anon"))


def test_hs256_is_refused_when_no_secret_is_configured(es256_keys):
    _, public = es256_keys
    strict = TokenVerifier(
        issuer=ISSUER, hs256_secret=None, jwks=StubJwks("this-project-kid", public)
    )
    with pytest.raises(AuthError, match="SUPABASE_JWT_SECRET"):
        strict.user_id(make_hs256_token())


def test_garbage_is_malformed(verifier):
    with pytest.raises(AuthError, match="Malformed"):
        verifier.user_id("not.a.jwt")


# ── Through the app ───────────────────────────────────────────────────────────


@pytest.fixture
def client(verifier) -> TestClient:
    settings = Settings(
        SUPABASE_URL="https://this-project.supabase.co",
        SUPABASE_JWT_SECRET=SECRET,
        BOOK_SERVICE_DATABASE_URL=None,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        # The lifespan built a real PyJWKClient; swap in the stub so no test
        # reaches the network.
        app.state.verifier = verifier
        yield client


def test_health_needs_no_token(client):
    assert client.get("/health").json() == {"ok": True}


def test_me_without_a_token_is_401(client):
    response = client.get("/me")
    assert response.status_code == 401
    assert "Sign in" in response.json()["detail"]


def test_me_with_a_valid_token_echoes_the_user(client, es256_keys):
    private, _ = es256_keys
    token = make_token(private_key=private)
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"user_id": USER}


def test_me_with_an_expired_token_is_401(client, es256_keys):
    private, _ = es256_keys
    token = make_token(private_key=private, expires_in=-1)
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "expired" in response.json()["detail"]
