from fastapi.testclient import TestClient

from strata_ai.main import create_app
from strata_ai.providers.registry import capability_status
from tests.conftest import auth, make_settings


def test_everything_awaits_credentials_without_keys(client):
    body = client.get("/v1/capabilities", headers=auth()).json()
    statuses = {c["key"]: c["status"] for c in body["capabilities"]}
    assert set(statuses.values()) == {"awaiting_credentials"}
    assert {"llm", "embeddings", "speech", "images", "video_clips", "avatar"} <= statuses.keys()


def test_configured_keys_report_ready_without_leaking_values():
    settings = make_settings(anthropic_api_key="sk-ant-secret-value", voyage_api_key="pa-secret")
    client = TestClient(create_app(settings))
    response = client.get("/v1/capabilities", headers=auth())
    statuses = {c["key"]: c["status"] for c in response.json()["capabilities"]}
    assert statuses["llm"] == statuses["embeddings"] == statuses["rerank"] == "ready"
    assert statuses["speech"] == "awaiting_credentials"
    assert "sk-ant-secret-value" not in response.text and "pa-secret" not in response.text


def test_blank_key_is_not_ready():
    statuses = {c["key"]: c["status"] for c in capability_status(make_settings(anthropic_api_key="  "))}
    assert statuses["llm"] == "awaiting_credentials"
