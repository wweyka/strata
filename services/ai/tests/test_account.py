import json

import httpx
import pytest
from fastapi.testclient import TestClient

from strata_ai.core.supabase_admin import SupabaseAdmin, SupabaseAdminError
from strata_ai.main import create_app
from tests.conftest import USER_ID, auth, make_settings


class FakeSupabase:
    """Records calls to the Storage and Auth admin APIs."""

    def __init__(self, files: dict[str, dict[str, list[dict]]], fail_remove: bool = False) -> None:
        self.files = files  # bucket -> prefix -> list response
        self.fail_remove = fail_remove
        self.removed: dict[str, list[str]] = {}
        self.deleted_users: list[str] = []
        self.auth_headers: set[str] = set()
        self.api_keys: set[str] = set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.auth_headers.add(request.headers.get("Authorization", ""))
        self.api_keys.add(request.headers.get("apikey", ""))
        path = request.url.path
        if path.startswith("/storage/v1/object/list/"):
            bucket = path.rsplit("/", 1)[1]
            prefix = json.loads(request.content)["prefix"]
            return httpx.Response(200, json=self.files.get(bucket, {}).get(prefix, []))
        if request.method == "DELETE" and path.startswith("/storage/v1/object/"):
            if self.fail_remove:
                return httpx.Response(500, json={"error": "boom"})
            bucket = path.rsplit("/", 1)[1]
            self.removed.setdefault(bucket, []).extend(json.loads(request.content)["prefixes"])
            return httpx.Response(200, json=[])
        if request.method == "DELETE" and path.startswith("/auth/v1/admin/users/"):
            self.deleted_users.append(path.rsplit("/", 1)[1])
            return httpx.Response(200, json={})
        return httpx.Response(404)


def admin_for(fake: FakeSupabase, key: str = "eyJ.legacy.jwt") -> SupabaseAdmin:
    return SupabaseAdmin("http://supabase.test", key, transport=httpx.MockTransport(fake.handler))


FILES = {
    "materials": {
        USER_ID: [{"name": "m1", "id": None}, {"name": "notes.txt", "id": "f0"}],
        f"{USER_ID}/m1": [{"name": "book.pdf", "id": "f1"}],
    },
    "avatars": {USER_ID: [{"name": "avatar.png", "id": "f2"}]},
}


async def test_deletes_files_recursively_then_user():
    fake = FakeSupabase(FILES)
    removed = await admin_for(fake).delete_user_and_files(USER_ID)
    assert removed == 3
    assert sorted(fake.removed["materials"]) == [f"{USER_ID}/m1/book.pdf", f"{USER_ID}/notes.txt"]
    assert fake.removed["avatars"] == [f"{USER_ID}/avatar.png"]
    assert fake.deleted_users == [USER_ID]
    assert fake.auth_headers == {"Bearer eyJ.legacy.jwt"}
    assert fake.api_keys == {"eyJ.legacy.jwt"}


async def test_new_secret_keys_are_sent_as_apikey_only():
    fake = FakeSupabase(FILES)
    await admin_for(fake, key="sb_secret_abc").delete_user_and_files(USER_ID)
    assert fake.api_keys == {"sb_secret_abc"}
    assert fake.auth_headers == {""}


async def test_user_is_kept_when_file_removal_fails():
    fake = FakeSupabase(FILES, fail_remove=True)
    with pytest.raises(SupabaseAdminError):
        await admin_for(fake).delete_user_and_files(USER_ID)
    assert fake.deleted_users == []


def test_endpoint_deletes_only_the_caller():
    fake = FakeSupabase(FILES)
    client = TestClient(create_app(make_settings(), admin=admin_for(fake)))
    response = client.delete("/v1/account", headers=auth())
    assert response.status_code == 200
    assert response.json() == {"deleted": True, "files_removed": 3}
    assert fake.deleted_users == [USER_ID]


def test_endpoint_reports_failure_without_details():
    fake = FakeSupabase(FILES, fail_remove=True)
    client = TestClient(create_app(make_settings(), admin=admin_for(fake)))
    response = client.delete("/v1/account", headers=auth())
    assert response.status_code == 502
    assert "boom" not in response.text
    assert fake.deleted_users == []


def test_endpoint_requires_sign_in():
    fake = FakeSupabase(FILES)
    client = TestClient(create_app(make_settings(), admin=admin_for(fake)))
    assert client.delete("/v1/account").status_code == 401
    assert fake.deleted_users == []
