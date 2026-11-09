"""Queue behaviour against a real Supabase schema. Runs when STRATA_TEST_DB_URL is set
(e.g. `supabase start` locally, or the CI database). Stop any worker running against the same
database first, or it will claim the test jobs."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from strata_ai.main import create_app
from strata_ai.worker.queue import Worker
from tests.conftest import make_settings

DB_URL = os.environ.get("STRATA_TEST_DB_URL")
pytestmark = pytest.mark.skipif(not DB_URL, reason="STRATA_TEST_DB_URL not set")


@pytest.fixture
async def pool():
    pool = AsyncConnectionPool(DB_URL, open=False, kwargs={"row_factory": dict_row, "autocommit": True})
    await pool.open()
    yield pool
    await pool.close()


@pytest.fixture
async def material(pool):
    """A user with an uploaded material and its queued ingestion job."""
    user_id = uuid.uuid4()
    async with pool.connection() as conn:
        await conn.execute(
            "insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, '{}')",
            (user_id, f"{user_id}@example.com"),
        )
        cur = await conn.execute(
            """insert into public.materials (user_id, title, kind, mime_type, size_bytes, storage_path, status)
               values (%s, 'Notes', 'text', 'text/plain', 10, %s, 'queued') returning id""",
            (user_id, f"{user_id}/notes.txt"),
        )
        material_id = (await cur.fetchone())["id"]
        cur = await conn.execute(
            """insert into public.jobs (user_id, kind, payload, idempotency_key, subject_type, subject_id)
               values (%s, 'ingest_material', jsonb_build_object('material_id', %s::text), %s, 'material', %s)
               returning id""",
            (user_id, material_id, f"material:{material_id}", material_id),
        )
        job_id = (await cur.fetchone())["id"]
    yield {"user_id": user_id, "material_id": material_id, "job_id": job_id}
    async with pool.connection() as conn:
        await conn.execute("delete from auth.users where id = %s", (user_id,))


async def _state(pool, material):
    async with pool.connection() as conn:
        job = await (
            await conn.execute("select * from public.jobs where id = %s", (material["job_id"],))
        ).fetchone()
        mat = await (
            await conn.execute("select * from public.materials where id = %s", (material["material_id"],))
        ).fetchone()
    return job, mat


async def _drain(worker: Worker) -> None:
    # Other rows may exist in a shared dev database; process until the queue is empty for us.
    while await worker.run_once():
        pass


async def test_job_without_credentials_is_parked_not_faked(pool, material):
    worker = Worker(pool, make_settings(supabase_db_url=DB_URL), handlers={}, name="test-a")
    assert "ingest_material" in worker.kinds
    await _drain(worker)
    job, mat = await _state(pool, material)
    assert job["status"] == "awaiting_credentials"
    assert job["attempts"] == 0
    assert set(job["error"]["configure"]) == {"ANTHROPIC_API_KEY", "VOYAGE_API_KEY"}
    assert mat["status"] == "awaiting_credentials"


async def test_parked_job_resumes_once_credentials_exist(pool, material):
    await _drain(Worker(pool, make_settings(supabase_db_url=DB_URL), handlers={}, name="test-b"))

    seen: list[str] = []

    async def ingest(job, ctx):
        await ctx.report("parsing", 0.5)
        seen.append(job["payload"]["material_id"])
        return {"pages": 1}

    keys = make_settings(supabase_db_url=DB_URL, anthropic_api_key="k", voyage_api_key="k")
    worker = Worker(pool, keys, handlers={"ingest_material": ingest}, name="test-c")
    assert await worker.resume_parked() >= 1
    _, mat = await _state(pool, material)
    assert mat["status"] == "queued"
    await _drain(worker)
    job, _ = await _state(pool, material)
    assert str(material["material_id"]) in seen
    assert job["status"] == "succeeded" and job["result"] == {"pages": 1} and job["progress"] == 1


async def test_failing_handler_retries_then_fails_the_material(pool, material):
    async def broken(job, ctx):
        raise RuntimeError("parser crashed")

    keys = make_settings(supabase_db_url=DB_URL, anthropic_api_key="k", voyage_api_key="k")
    worker = Worker(pool, keys, handlers={"ingest_material": broken}, name="test-d")
    for _ in range(3):
        async with pool.connection() as conn:
            await conn.execute(
                "update public.jobs set run_after = now() where id = %s", (material["job_id"],)
            )
        await _drain(worker)
    job, mat = await _state(pool, material)
    assert job["status"] == "failed" and job["attempts"] == 3
    assert job["error"]["message"] == "parser crashed"
    assert mat["status"] == "failed"


def test_health_reports_database():
    with TestClient(create_app(make_settings(supabase_db_url=DB_URL))) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
