import jwt

from tests.conftest import SECRET, auth, make_token


def test_missing_token_is_401(client):
    response = client.get("/v1/capabilities")
    assert response.status_code == 401


def test_valid_token_is_accepted(client):
    assert client.get("/v1/capabilities", headers=auth()).status_code == 200


def test_expired_token_is_401(client):
    assert client.get("/v1/capabilities", headers=auth(make_token(ttl=-60))).status_code == 401


def test_wrong_audience_is_401(client):
    assert client.get("/v1/capabilities", headers=auth(make_token(aud="other"))).status_code == 401


def test_wrong_signature_is_401(client):
    forged = jwt.encode(
        {"sub": "x", "role": "authenticated", "aud": "authenticated", "exp": 9999999999},
        "another-secret-that-is-also-long-enough-123",
        algorithm="HS256",
    )
    assert client.get("/v1/capabilities", headers=auth(forged)).status_code == 401


def test_unsigned_token_is_401(client):
    unsigned = jwt.encode(
        {"sub": "x", "role": "authenticated", "aud": "authenticated"}, None, algorithm="none"
    )
    assert client.get("/v1/capabilities", headers=auth(unsigned)).status_code == 401


def test_anon_key_is_not_a_user(client):
    # The public anon key is a valid project JWT but must not act as a signed-in user.
    anon = make_token(role="anon")
    assert client.get("/v1/capabilities", headers=auth(anon)).status_code == 403


def test_service_role_key_is_not_a_user(client):
    service = jwt.encode(
        {"role": "service_role", "aud": "authenticated", "sub": "service", "exp": 9999999999}, SECRET, "HS256"
    )
    assert client.get("/v1/capabilities", headers=auth(service)).status_code == 403
