"""Postgres-backed job queue consumer.

Jobs are claimed with `claim_job` (FOR UPDATE SKIP LOCKED), so any number of workers can run.
A job whose capability has no credentials is parked as `awaiting_credentials`, and parked
jobs are put back in the queue once the credentials are configured.
"""

import asyncio
import json
import logging
import socket
import uuid
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from typing import Any

from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool

from strata_ai.core.config import Settings
from strata_ai.providers.registry import capability_status

log = logging.getLogger(__name__)

# Capabilities each job kind needs before it can run at all.
JOB_REQUIREMENTS: dict[str, tuple[str, ...]] = {
    "ingest_material": ("llm", "embeddings"),
    "generate_video": ("llm", "speech"),
    "generate_cards": ("llm",),
    "tutor_reply": ("llm", "embeddings"),
}

# Rows whose status, stage and error mirror their job for the app. Videos track their stages
# in video_generation_jobs and join this map in Phase 3.
SUBJECT_TABLES: dict[str, str] = {"material": "materials"}

Job = dict[str, Any]
Handler = Callable[[Job, "JobContext"], Awaitable[dict[str, Any] | None]]


@dataclass
class JobContext:
    pool: AsyncConnectionPool
    settings: Settings
    job_id: uuid.UUID

    async def report(self, stage: str, progress: float) -> None:
        """Progress shown to the user live (jobs are in the realtime publication)."""
        async with self.pool.connection() as conn:
            await conn.execute(
                "update public.jobs set stage = %s, progress = %s, heartbeat_at = now() where id = %s",
                (stage, max(0.0, min(1.0, progress)), self.job_id),
            )


class Worker:
    def __init__(
        self,
        pool: AsyncConnectionPool,
        settings: Settings,
        handlers: dict[str, Handler],
        name: str | None = None,
    ) -> None:
        self.pool = pool
        self.settings = settings
        self.handlers = handlers
        self.name = name or f"{socket.gethostname()}-{uuid.uuid4().hex[:6]}"
        ready = {c["key"] for c in capability_status(settings) if c["status"] == "ready"}
        self.missing: dict[str, list[str]] = {
            kind: [cap for cap in caps if cap not in ready] for kind, caps in JOB_REQUIREMENTS.items()
        }
        # Claim what we can run, and what we can only park, so nothing waits silently.
        self.runnable = [kind for kind in handlers if not self.missing.get(kind)]
        self.parkable = [kind for kind, gaps in self.missing.items() if gaps]

    @property
    def kinds(self) -> list[str]:
        return sorted(set(self.runnable) | set(self.parkable))

    async def resume_parked(self) -> int:
        """Re-queue parked jobs whose credentials are now configured."""
        if not self.runnable:
            return 0
        async with self.pool.connection() as conn, conn.transaction():
            cur = await conn.execute(
                """update public.jobs
                      set status = 'queued', stage = 'queued', error = null, run_after = now()
                    where status = 'awaiting_credentials' and kind = any(%s)
                returning subject_type, subject_id""",
                (self.runnable,),
            )
            rows = await cur.fetchall()
            for row in rows:
                await _set_subject(conn, row["subject_type"], row["subject_id"], "queued", None)
        return len(rows)

    async def run_once(self) -> bool:
        """Claim and process one job. Returns False when the queue had nothing for us."""
        kinds = self.kinds
        if not kinds:
            return False
        async with self.pool.connection() as conn:
            cur = await conn.execute("select * from public.claim_job(%s, %s)", (self.name, kinds))
            job = await cur.fetchone()
        if job is None:
            return False

        gaps = self.missing.get(job["kind"])
        if gaps:
            await self._park(job, gaps)
            return True
        await self._run(job)
        return True

    async def _park(self, job: Job, gaps: Iterable[str]) -> None:
        caps = {c["key"]: c for c in capability_status(self.settings)}
        error = {
            "reason": "awaiting_credentials",
            "capabilities": list(gaps),
            "configure": sorted({str(caps[g]["env_var"]) for g in gaps}),
        }
        async with self.pool.connection() as conn, conn.transaction():
            await conn.execute(
                """update public.jobs
                      set status = 'awaiting_credentials', stage = 'awaiting_credentials',
                          attempts = greatest(attempts - 1, 0), locked_by = null, locked_at = null,
                          error = %s
                    where id = %s""",
                (json.dumps(error), job["id"]),
            )
            await _set_subject(conn, job["subject_type"], job["subject_id"], "awaiting_credentials", error)
        log.info("parked job %s (%s): awaiting %s", job["id"], job["kind"], ", ".join(gaps))

    async def _run(self, job: Job) -> None:
        handler = self.handlers[job["kind"]]
        context = JobContext(self.pool, self.settings, job["id"])
        try:
            result = await handler(job, context)
        except Exception as exc:  # noqa: BLE001 - every failure is recorded on the job
            log.exception("job %s (%s) failed", job["id"], job["kind"])
            final = job["attempts"] >= job["max_attempts"]
            error = {"reason": "handler_error", "message": str(exc)[:500]}
            async with self.pool.connection() as conn, conn.transaction():
                await conn.execute(
                    """update public.jobs
                          set status = %s, error = %s, locked_by = null, locked_at = null,
                              run_after = now() + (interval '30 seconds' * power(2, attempts)),
                              finished_at = case when %s then now() end
                        where id = %s""",
                    ("failed" if final else "queued", json.dumps(error), final, job["id"]),
                )
                if final:
                    await _set_subject(conn, job["subject_type"], job["subject_id"], "failed", error)
            return
        async with self.pool.connection() as conn:
            await conn.execute(
                """update public.jobs
                      set status = 'succeeded', progress = 1, stage = 'done', result = %s,
                          locked_by = null, finished_at = now()
                    where id = %s""",
                (json.dumps(result or {}), job["id"]),
            )

    async def run_forever(self, poll_seconds: float = 5.0) -> None:
        log.info("worker %s handling %s", self.name, ", ".join(self.kinds) or "nothing")
        resumed = await self.resume_parked()
        if resumed:
            log.info("re-queued %d jobs whose credentials are now configured", resumed)
        listener = await AsyncConnection.connect(
            self.settings.supabase_db_url.get_secret_value(), autocommit=True
        )
        await listener.execute("listen strata_jobs")
        last_reap = 0.0
        loop = asyncio.get_running_loop()
        try:
            while True:
                if loop.time() - last_reap > 60:
                    async with self.pool.connection() as conn:
                        await conn.execute("select public.requeue_stale_jobs()")
                    last_reap = loop.time()
                while await self.run_once():
                    pass
                # Sleep until a job is enqueued (NOTIFY) or the poll interval passes.
                gen = listener.notifies(timeout=poll_seconds, stop_after=1)
                async for _ in gen:
                    pass
        finally:
            await listener.close()


async def _set_subject(
    conn: AsyncConnection,
    subject_type: str | None,
    subject_id: uuid.UUID | None,
    status: str,
    error: dict[str, Any] | None,
) -> None:
    table = SUBJECT_TABLES.get(subject_type or "")
    if table is None or subject_id is None:
        return
    # Table name comes from the fixed mapping above, never from input.
    await conn.execute(
        f"update public.{table} set status = %s, stage = %s, error = %s where id = %s",  # noqa: S608
        (status, status, json.dumps(error) if error else None, subject_id),
    )
