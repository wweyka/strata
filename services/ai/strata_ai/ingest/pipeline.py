"""The `ingest_material` job: turn an uploaded file into passages, a search index and topics.

Stages (shown to the learner live): downloading, extracting, reading_scans, indexing, analyzing,
organizing, saving. Nothing is generated for the feed here: videos, cards and quizzes are made on
demand later from the knowledge this builds.
"""

import asyncio
import hashlib
import logging
import math
import uuid
from typing import Any

import anthropic
from psycopg_pool import AsyncConnectionPool

from strata_ai.core.config import Settings
from strata_ai.core.supabase_admin import SupabaseAdmin, SupabaseAdminError
from strata_ai.ingest.analysis import analyse
from strata_ai.ingest.chunking import Chunk, make_chunks
from strata_ai.ingest.extract import UnreadableFile, UnsupportedFormat, extract
from strata_ai.ingest.ocr import merge_readings, read_pages
from strata_ai.ingest.store import Processed, save
from strata_ai.ingest.structure import plan_chapters
from strata_ai.providers.claude import Claude, ModelRefused, OutputTruncated, UsageSink
from strata_ai.providers.registry import capability_status
from strata_ai.providers.voyage import EmbeddingAuthError, Voyage
from strata_ai.worker.queue import Job, JobContext, PermanentJobError

log = logging.getLogger(__name__)

CHARS_PER_PAGE = 3000  # how pages are counted for files without pages (Word, Markdown, web pages)


class IngestMaterial:
    def __init__(
        self,
        pool: AsyncConnectionPool,
        settings: Settings,
        storage: SupabaseAdmin,
        claude: Claude,
        voyage: Voyage,
    ) -> None:
        self.pool = pool
        self.settings = settings
        self.storage = storage
        self.claude = claude
        self.voyage = voyage

    async def aclose(self) -> None:
        await asyncio.gather(self.storage.aclose(), self.claude.aclose(), self.voyage.aclose())

    async def __call__(self, job: Job, ctx: JobContext) -> dict[str, Any]:
        try:
            return await self._ingest(job, ctx)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            raise PermanentJobError(
                "provider_auth", f"Anthropic rejected the key: {exc.message}", configure=["ANTHROPIC_API_KEY"]
            ) from exc
        except EmbeddingAuthError as exc:
            raise PermanentJobError("provider_auth", str(exc), configure=["VOYAGE_API_KEY"]) from exc
        except anthropic.BadRequestError as exc:
            # Includes an exhausted credit balance; retrying would spend nothing and fix nothing.
            raise PermanentJobError("provider_rejected", f"Anthropic: {exc.message}") from exc
        except ModelRefused as exc:
            raise PermanentJobError("model_refused", str(exc)) from exc
        except OutputTruncated as exc:
            raise PermanentJobError("output_too_long", str(exc)) from exc

    async def _ingest(self, job: Job, ctx: JobContext) -> dict[str, Any]:
        material_id = uuid.UUID(str(job["payload"]["material_id"]))
        user_id = job["user_id"]
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                """select m.id, m.title, m.mime_type, m.storage_path, m.checksum_sha256,
                          public.plan_limits(m.user_id) as limits,
                          coalesce((select used from public.usage_counters u
                                     where u.user_id = m.user_id and u.metric = 'pages'
                                       and u.period_start = date_trunc('month', now())::date), 0)
                            as pages_used,
                          array(select s.name from public.subjects s where s.user_id = m.user_id
                                 order by s.updated_at desc limit 100) as subjects
                     from public.materials m
                    where m.id = %s and m.user_id = %s""",
                (material_id, user_id),
            )
            material = await cur.fetchone()
        if material is None:
            return {"skipped": "material_deleted"}
        limits = material["limits"] or {}

        await ctx.report("downloading", 0.02)
        max_bytes = int(limits.get("max_file_mb", 100)) * 1024 * 1024
        try:
            data = await self.storage.download("materials", material["storage_path"], max_bytes)
        except SupabaseAdminError as exc:
            if "not found" in str(exc):
                raise PermanentJobError("file_missing", str(exc)) from exc
            if "larger than" in str(exc):
                raise PermanentJobError("file_too_large", str(exc)) from exc
            raise
        checksum = hashlib.sha256(data).hexdigest()
        if material["checksum_sha256"] and material["checksum_sha256"] != checksum:
            raise PermanentJobError("checksum_mismatch", "the stored file does not match the uploaded one")

        await ctx.report("extracting", 0.05)
        try:
            extracted = await asyncio.to_thread(
                extract, data, material["mime_type"], self.settings.ocr_max_pages
            )
        except UnsupportedFormat as exc:
            raise PermanentJobError("unsupported_format", f"cannot read {exc}") from exc
        except UnreadableFile as exc:
            raise PermanentJobError("unreadable_file", str(exc)) from exc
        del data

        text_chars = sum(len(block.text) for block in extracted.blocks)
        pages = extracted.page_count or max(1, math.ceil(text_chars / CHARS_PER_PAGE))
        allowed = int(limits.get("pages_per_month", 2000))
        if material["pages_used"] + pages > allowed:
            raise PermanentJobError(
                "page_quota",
                f"{pages} pages would exceed the monthly limit of {allowed} ({material['pages_used']} used)",
                pages=pages,
                limit=allowed,
                used=material["pages_used"],
            )

        warnings: list[dict[str, Any]] = []
        readings = {}
        if extracted.ocr_pages:
            await ctx.report("reading_scans", 0.08)

            async def scans_done(done: int, total: int) -> None:
                if done == total or done % 5 == 0:
                    await ctx.report("reading_scans", 0.08 + 0.27 * done / total)

            readings = await read_pages(self.claude, extracted.ocr_pages, scans_done)
            illegible = sorted(number for number, reading in readings.items() if not reading.legible)
            if illegible:
                warnings.append({"kind": "illegible_pages", "pages": illegible[:50], "count": len(illegible)})
        if extracted.scans_skipped:
            warnings.append(
                {
                    "kind": "scans_skipped",
                    "count": len(extracted.scans_skipped),
                    "first": extracted.scans_skipped[0],
                    "limit": self.settings.ocr_max_pages,
                }
            )
        extracted.ocr_pages = []  # release the page images
        blocks = merge_readings(extracted, readings)
        chunks = make_chunks(blocks)
        if not any(chunk.source_kind != "figure" for chunk in chunks):
            raise PermanentJobError("no_text", "no readable text was found in the file")

        await ctx.report("indexing", 0.36)
        chunk_vectors = await self.voyage.embed(
            [_embedding_text(material["title"], c) for c in chunks], kind="document"
        )

        await ctx.report("analyzing", 0.45)

        async def window_done(done: int, total: int) -> None:
            await ctx.report("analyzing", 0.45 + 0.43 * done / total)

        analysis = await analyse(
            self.claude, material["title"], chunks, list(material["subjects"]), window_done
        )
        if not analysis.topics:
            warnings.append({"kind": "no_topics"})

        await ctx.report("organizing", 0.9)
        structure = plan_chapters(material["title"], extracted.outline, analysis.sections, chunks)
        topic_vectors = (
            await self.voyage.embed([f"{t.title}\n{t.summary}" for t in analysis.topics], kind="document")
            if analysis.topics
            else []
        )

        await ctx.report("saving", 0.95)
        stats = await save(
            self.pool,
            material_id,
            user_id,
            Processed(
                extracted=extracted,
                chunks=chunks,
                chunk_vectors=chunk_vectors,
                structure=structure,
                analysis=analysis,
                topic_vectors=topic_vectors,
                checksum=checksum,
                pages_counted=pages,
                warnings=warnings,
            ),
        )
        if stats is None:
            return {"skipped": "material_deleted"}
        log.info("material %s ready: %s", material_id, stats)
        return {"stats": {**stats, **analysis.stats, "scanned_pages": len(readings)}, "warnings": warnings}


def _embedding_text(title: str, chunk: Chunk) -> str:
    """The passage with its place in the document, which helps search find it."""
    context = " > ".join((title, *chunk.heading_path))
    return f"{context}\n\n{chunk.text}"


def ingest_handler(
    settings: Settings, pool: AsyncConnectionPool, usage_sink: UsageSink
) -> IngestMaterial | None:
    """The handler, or None while the Claude or Voyage key is missing (jobs are then parked)."""
    ready = {c["key"] for c in capability_status(settings) if c["status"] == "ready"}
    if not {"llm", "embeddings"} <= ready:
        return None
    assert settings.anthropic_api_key is not None and settings.voyage_api_key is not None
    return IngestMaterial(
        pool,
        settings,
        SupabaseAdmin(settings.supabase_url, settings.supabase_service_role_key.get_secret_value()),
        Claude(
            settings.anthropic_api_key.get_secret_value(),
            settings.llm_model,
            settings.llm_vision_model,
            usage_sink,
        ),
        Voyage(
            settings.voyage_api_key.get_secret_value(),
            settings.embedding_model,
            settings.embedding_dimensions,
            usage_sink,
        ),
    )
