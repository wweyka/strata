"""The ingestion job end to end against a real Supabase schema, with the AI providers faked.

The fakes answer like the real models would (including one invented quote), so these tests check
what the pipeline stores and how it treats unsupported claims, not the models themselves.
Runs when STRATA_TEST_DB_URL is set.
"""

import hashlib
import os
import re
import uuid

import pytest
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from strata_ai.ingest.analysis import (
    CitationOut,
    ConsolidationAnswer,
    ItemOut,
    MergedTopicOut,
    RelationOut,
    TopicOut,
    WindowAnswer,
)
from strata_ai.ingest.pipeline import IngestMaterial
from strata_ai.providers.claude import LLMUsage
from strata_ai.worker.queue import CURRENT_JOB, Worker
from strata_ai.worker.usage import UsageLedger
from tests.conftest import make_settings

DB_URL = os.environ.get("STRATA_TEST_DB_URL")
pytestmark = pytest.mark.skipif(not DB_URL, reason="STRATA_TEST_DB_URL not set")

NETWORKS = b"""# Addressing

An IPv4 address has 32 bits and is written as four decimal numbers separated by dots.

## Subnetting

Subnetting divides one network into several smaller networks called subnets.
"""

ROUTING = b"""# Routing and subnets

Routers forward packets between subnets. Subnetting divides one network into several smaller networks.
"""


def passage_of(content: str, quote: str) -> int:
    for number, text in re.findall(
        r'<passage n="(\d+)"(?: \w+="[^"]*")*>\n(.*?)\n</passage>', content, flags=re.S
    ):
        if quote in text:
            return int(number)
    raise AssertionError(f"quote not in any passage: {quote}")


def item(content: str, quote: str | None, source: str, kind: str = "fact") -> ItemOut:
    if quote is None:
        return ItemOut(kind=kind, term=None, content=content, basis="ai_supplement", citations=[])
    return ItemOut(
        kind=kind,
        term=None,
        content=content,
        basis="source",
        citations=[CitationOut(passage=passage_of(source, quote) if quote in source else 1, quote=quote)],
    )


def topic(key: str, title: str, items: list[ItemOut], parent: str | None = None) -> TopicOut:
    return TopicOut(
        key=key,
        title=title,
        parent=parent,
        summary=f"{title} explained.",
        difficulty=2,
        importance=4,
        passages=[1],
        items=items,
    )


class FakeClaude:
    vision_model = "fake-vision"

    def __init__(self) -> None:
        self.operations: list[str] = []

    async def structured(self, *, operation, system, content, output, **kwargs):
        self.operations.append(operation)
        if operation == "analyse_window" and "IPv4" in content:
            return WindowAnswer(
                sections=[],
                topics=[
                    topic(
                        "ipv4",
                        "IPv4 addresses",
                        [item("An IPv4 address is 32 bits long.", "An IPv4 address has 32 bits", content)],
                    ),
                    topic(
                        "subnetting",
                        "Subnetting",
                        [
                            item(
                                "Subnetting splits a network into subnets.",
                                "divides one network into several",
                                content,
                            ),
                            item("A /24 subnet has 256 addresses.", None, content),
                            item(
                                "Subnetting was standardised in 1985.",
                                "Subnetting was standardised in 1985",
                                content,
                            ),
                        ],
                        parent="ipv4",
                    ),
                ],
                relations=[
                    RelationOut(source="ipv4", target="subnetting", kind="prerequisite", basis="source")
                ],
            )
        if operation == "analyse_window":
            return WindowAnswer(
                sections=[],
                topics=[
                    topic(
                        "subnets",
                        "Subnetting",
                        [item("Routers forward between subnets.", "Routers forward packets", content)],
                    ),
                    topic(
                        "routing",
                        "Routing",
                        [item("Routers forward packets.", "forward packets between subnets", content)],
                    ),
                ],
                relations=[],
            )
        if operation == "consolidate_topics":
            ids = re.findall(r"id=(\S+)", content)
            return ConsolidationAnswer(
                language="en",
                subject="Computer Networks",
                subject_description="How computers exchange data.",
                topics=[MergedTopicOut(key=i.split(":")[1], title="", parent=None, members=[i]) for i in ids],
                relations=[],
            )
        raise AssertionError(f"unexpected operation {operation}")

    async def aclose(self) -> None:
        return None


class FakeVoyage:
    async def embed(self, texts, *, kind):
        vectors = []
        for text in texts:
            # Same title, same vector: lets the store merge topics by meaning as well as title.
            seed = hashlib.sha256(text.split("\n")[0].encode()).digest()
            vectors.append([b / 255 for b in seed] * 32)
        return vectors

    async def aclose(self) -> None:
        return None


class FakeStorage:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    async def download(self, bucket, path, max_bytes):
        from strata_ai.core.supabase_admin import SupabaseAdminError

        if path not in self.files:
            raise SupabaseAdminError(f"{bucket}/{path} was not found in storage")
        return self.files[path]

    async def aclose(self) -> None:
        return None


@pytest.fixture
async def pool():
    pool = AsyncConnectionPool(DB_URL, open=False, kwargs={"row_factory": dict_row, "autocommit": True})
    await pool.open()
    yield pool
    await pool.close()


@pytest.fixture
async def user(pool):
    user_id = uuid.uuid4()
    async with pool.connection() as conn:
        await conn.execute(
            "insert into auth.users (id, email, raw_user_meta_data) values (%s, %s, '{}')",
            (user_id, f"{user_id}@example.com"),
        )
    yield user_id
    async with pool.connection() as conn:
        await conn.execute("delete from auth.users where id = %s", (user_id,))


@pytest.fixture
def storage():
    return FakeStorage()


@pytest.fixture
def worker(pool, storage):
    settings = make_settings(supabase_db_url=DB_URL, anthropic_api_key="test", voyage_api_key="test")
    handler = IngestMaterial(pool, settings, storage, FakeClaude(), FakeVoyage())  # type: ignore[arg-type]
    return Worker(pool, settings, {"ingest_material": handler}, name="ingest-test")


async def upload(pool, storage, user_id, title, data, mime="text/markdown"):
    """What the app does: insert the material, put the file, call complete_material_upload."""
    path = f"{user_id}/{uuid.uuid4()}.bin"
    storage.files[path] = data
    async with pool.connection() as conn:
        cur = await conn.execute(
            """insert into public.materials (user_id, title, kind, mime_type, size_bytes, storage_path, status)
               values (%s, %s, 'text', %s, %s, %s, 'queued') returning id""",
            (user_id, title, mime, len(data), path),
        )
        material_id = (await cur.fetchone())["id"]
        await conn.execute(
            """insert into public.jobs (user_id, kind, payload, idempotency_key, subject_type, subject_id)
               values (%s, 'ingest_material', jsonb_build_object('material_id', %s::text), %s, 'material', %s)""",
            (user_id, material_id, f"material:{material_id}", material_id),
        )
    return material_id


async def drain(worker):
    while await worker.run_once():
        pass


async def one(pool, sql, *args):
    async with pool.connection() as conn:
        return await (await conn.execute(sql, args)).fetchone()


async def rows(pool, sql, *args):
    async with pool.connection() as conn:
        return await (await conn.execute(sql, args)).fetchall()


async def test_material_becomes_a_grounded_knowledge_library(pool, storage, worker, user):
    material_id = await upload(pool, storage, user, "Networks", NETWORKS)
    await drain(worker)

    job = await one(pool, "select * from public.jobs where subject_id = %s", material_id)
    assert job["status"] == "succeeded", job["error"]
    assert job["result"]["stats"]["citations_rejected"] == 1
    material = await one(pool, "select * from public.materials where id = %s", material_id)
    assert (material["status"], material["stage"], material["progress"]) == ("ready", "ready", 1)
    assert material["language"] == "en"
    assert material["checksum_sha256"] == hashlib.sha256(NETWORKS).hexdigest()

    chapters = await rows(pool, "select * from public.chapters where user_id = %s order by ordinal", user)
    assert [(c["title"], c["level"]) for c in chapters] == [("Addressing", 1), ("Subnetting", 2)]
    assert chapters[1]["parent_id"] == chapters[0]["id"]
    chunks = await rows(
        pool,
        "select ordinal, chapter_id, embedding is not null as indexed from public.document_chunks"
        " where user_id = %s order by ordinal",
        user,
    )
    assert [(c["chapter_id"], c["indexed"]) for c in chunks] == [
        (chapters[0]["id"], True),
        (chapters[1]["id"], True),
    ]

    topics = {t["title"]: t for t in await rows(pool, "select * from public.topics where user_id = %s", user)}
    assert set(topics) == {"IPv4 addresses", "Subnetting"}
    assert topics["Subnetting"]["parent_topic_id"] == topics["IPv4 addresses"]["id"]
    assert topics["Subnetting"]["slug"] == "subnetting"
    subject = await one(
        pool, "select * from public.subjects where id = %s", topics["Subnetting"]["subject_id"]
    )
    assert subject["name"] == "Computer Networks"

    items = await rows(
        pool,
        """select k.content, k.basis, k.material_id, c.quote, c.verified, c.chunk_id
             from public.knowledge_items k
             left join public.citations c on c.subject_type = 'knowledge_item' and c.subject_id = k.id
            where k.topic_id = %s order by k.ordinal""",
        topics["Subnetting"]["id"],
    )
    by_content = {i["content"]: i for i in items}
    grounded = by_content["Subnetting splits a network into subnets."]
    assert grounded["basis"] == "source" and grounded["verified"] and grounded["material_id"] == material_id
    assert grounded["quote"] == "divides one network into several"
    # The AI's own addition is kept and labelled; the claim with an invented quote is not stored.
    assert by_content["A /24 subnet has 256 addresses."]["basis"] == "ai_supplement"
    assert by_content["A /24 subnet has 256 addresses."]["quote"] is None
    assert "Subnetting was standardised in 1985." not in by_content

    relation = await one(pool, "select * from public.topic_relations where user_id = %s", user)
    assert (relation["from_topic_id"], relation["to_topic_id"], relation["relation"]) == (
        topics["IPv4 addresses"]["id"],
        topics["Subnetting"]["id"],
        "prerequisite",
    )
    sources = await rows(pool, "select * from public.topic_sources where user_id = %s", user)
    assert {s["material_id"] for s in sources} == {material_id}
    usage = await one(
        pool, "select used from public.usage_counters where user_id = %s and metric = 'pages'", user
    )
    assert usage["used"] == 1
    note = await one(pool, "select * from public.notifications where user_id = %s", user)
    assert note["kind"] == "material_ready" and note["data"]["material_id"] == str(material_id)


async def test_second_material_deepens_topics_and_deleting_prunes(pool, storage, worker, user):
    first = await upload(pool, storage, user, "Networks", NETWORKS)
    await drain(worker)
    second = await upload(pool, storage, user, "Routing", ROUTING)
    await drain(worker)

    topics = {
        t["title"]: t["id"] for t in await rows(pool, "select * from public.topics where user_id = %s", user)
    }
    assert set(topics) == {"IPv4 addresses", "Subnetting", "Routing"}  # "Subnetting" merged, not duplicated
    materials = await rows(
        pool,
        "select distinct material_id from public.topic_sources where topic_id = %s",
        topics["Subnetting"],
    )
    assert {m["material_id"] for m in materials} == {first, second}

    async with pool.connection() as conn:
        await conn.execute("delete from public.materials where id = %s", (first,))
    remaining = {t["title"] for t in await rows(pool, "select * from public.topics where user_id = %s", user)}
    assert remaining == {"Subnetting", "Routing"}
    items = await rows(pool, "select material_id from public.knowledge_items where user_id = %s", user)
    assert {i["material_id"] for i in items} == {second}


async def test_processing_again_replaces_instead_of_duplicating(pool, storage, worker, user):
    material_id = await upload(pool, storage, user, "Networks", NETWORKS)
    await drain(worker)
    async with pool.connection() as conn:
        await conn.execute(
            """insert into public.jobs (user_id, kind, payload, subject_type, subject_id)
               values (%s, 'ingest_material', jsonb_build_object('material_id', %s::text), 'material', %s)""",
            (user, material_id, material_id),
        )
    await drain(worker)
    counts = await one(
        pool,
        """select (select count(*) from public.documents where material_id = %(m)s) as documents,
                  (select count(*) from public.topics where user_id = %(u)s) as topics,
                  (select count(*) from public.knowledge_items where material_id = %(m)s) as items""".replace(
            "%(m)s", "%s"
        ).replace("%(u)s", "%s"),
        material_id,
        user,
        material_id,
    )
    assert (counts["documents"], counts["topics"], counts["items"]) == (1, 2, 3)


async def test_unreadable_files_fail_once_with_a_reason(pool, storage, worker, user):
    material_id = await upload(pool, storage, user, "Old file", b"{\\rtf1 hello}", mime="application/rtf")
    await drain(worker)
    job = await one(pool, "select * from public.jobs where subject_id = %s", material_id)
    material = await one(pool, "select * from public.materials where id = %s", material_id)
    assert (job["status"], job["attempts"]) == ("failed", 1)  # no pointless retries
    assert material["status"] == "failed" and material["error"]["reason"] == "unsupported_format"


async def test_missing_file_and_page_quota(pool, storage, worker, user):
    missing = await upload(pool, storage, user, "Gone", NETWORKS)
    storage.files.clear()
    await drain(worker)
    assert (await one(pool, "select error from public.materials where id = %s", missing))["error"][
        "reason"
    ] == ("file_missing")

    async with pool.connection() as conn:
        await conn.execute(
            """insert into public.usage_counters (user_id, metric, period_start, used)
               values (%s, 'pages', date_trunc('month', now())::date, 2000)""",
            (user,),
        )
    over = await upload(pool, storage, user, "One page too many", NETWORKS)
    await drain(worker)
    material = await one(pool, "select * from public.materials where id = %s", over)
    assert material["status"] == "failed"
    assert material["error"]["reason"] == "page_quota" and material["error"]["limit"] == 2000


async def test_usage_ledger_tags_the_running_job(pool, user):
    async with pool.connection() as conn:
        job_id = (
            await (
                await conn.execute(
                    "insert into public.jobs (user_id, kind, status) values (%s, 'ledger_test', 'running') returning id",
                    (user,),
                )
            ).fetchone()
        )["id"]
    token = CURRENT_JOB.set((user, job_id))
    try:
        await UsageLedger(pool)(
            LLMUsage("anthropic", "claude-opus-5-5", "analyse_window", 100, 20, 50, 10, 1234, "ok", 0.0012)
        )
    finally:
        CURRENT_JOB.reset(token)
    event = await one(pool, "select * from public.ai_usage_events where job_id = %s", job_id)
    assert (event["user_id"], event["input_units"], event["output_units"], event["status"]) == (
        user,
        160,
        20,
        "ok",
    )
