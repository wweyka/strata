"""Postgres-backed job queue consumer.

Jobs are claimed with `claim_job` (FOR UPDATE SKIP LOCKED), so any number of workers can run.
A job whose capability has no credentials is parked as `awaiting_credentials`, and parked
jobs are put back in the queue once the credentials are configured.
"""

import asyncio
import contextlib
import json
import logging
import socket
import uuid
from collections.abc import Awaitable, Callable, Iterable
from contextvars import ContextVar
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

HEARTBEAT_SECONDS = 30.0

# (user_id, job_id) of the job running in this task, for the AI usage ledger.
CURRENT_JOB: ContextVar[tuple[uuid.UUID | None, uuid.UUID] | None] = ContextVar("current_job", default=None)


class PermanentJobError(Exception):
    """A failure that retrying cannot fix (unsupported file, quota, rejected key...).

    `reason` is a stable code the app translates; `message` is for logs and support.
    """

    def __init__(self, reason: str, message: str, **details: Any) -> None:
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.details = details

    def as_error(self) -> dict[str, Any]:
        return {"reason": self.reason, "message": self.message[:500], **self.details}


@dataclass
class JobContext:
    pool: AsyncConnectionPool
    settings: Settings
    job_id: uuid.UUID
    subject_type: str | None = None
    subject_id: uuid.UUID | None = None

    async def report(self, stage: str, progress: float) -> None:
        """Progress shown to the user live (jobs and materials are in the realtime publication)."""
        progress = max(0.0, min(1.0, progress))
        async with self.pool.connection() as conn, conn.transaction():
            await conn.execute(
                "update public.jobs set stage = %s, progress = %s, heartbeat_at = now() where id = %s",
                (stage, progress, self.job_id),
            )
            await _set_subject(conn, self.subject_type, self.subject_id, "processing", None, stage, progress)


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
        context = JobContext(self.pool, self.settings, job["id"], job["subject_type"], job["subject_id"])
        async with self.pool.connection() as conn:
            await _set_subject(
                conn, job["subject_type"], job["subject_id"], "processing", None, "starting", 0.0
            )
        token = CURRENT_JOB.set((job["user_id"], job["id"]))
        heartbeat = asyncio.create_task(self._heartbeat(job["id"]))
        try:
            result = await handler(job, context)
        except Exception as exc:  # noqa: BLE001 - every failure is recorded on the job
            permanent = isinstance(exc, PermanentJobError)
            if permanent:
                log.warning("job %s (%s) cannot be completed: %s", job["id"], job["kind"], exc)
            else:
                log.exception("job %s (%s) failed", job["id"], job["kind"])
            final = permanent or job["attempts"] >= job["max_attempts"]
            error = (
                exc.as_error()
                if isinstance(exc, PermanentJobError)
                else {
                    "reason": "handler_error",
                    "message": str(exc)[:500],
                }
            )
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
                else:
                    await _set_subject(
                        conn, job["subject_type"], job["subject_id"], "queued", error, "retrying", 0.0
                    )
            return
        finally:
            heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat
            CURRENT_JOB.reset(token)
        async with self.pool.connection() as conn:
            await conn.execute(
                """update public.jobs
                      set status = 'succeeded', progress = 1, stage = 'done', result = %s,
                          locked_by = null, finished_at = now()
                    where id = %s""",
                (json.dumps(result or {}), job["id"]),
            )

    async def _heartbeat(self, job_id: uuid.UUID) -> None:
        """Keep the claim alive during long AI calls, so the job is not handed to another worker."""
        while True:
            await asyncio.sleep(HEARTBEAT_SECONDS)
            try:
                async with self.pool.connection() as conn:
                    await conn.execute("update public.jobs set heartbeat_at = now() where id = %s", (job_id,))
            except Exception:  # noqa: BLE001 - a missed beat is retried on the next tick
                log.warning("heartbeat for job %s failed", job_id, exc_info=True)

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
    stage: str | None = None,
    progress: float | None = None,
) -> None:
    table = SUBJECT_TABLES.get(subject_type or "")
    if table is None or subject_id is None:
        return
    # Table name comes from the fixed mapping above, never from input.
    await conn.execute(
        f"""update public.{table}
               set status = %s, stage = %s, error = %s, progress = coalesce(%s, progress)
             where id = %s""",  # noqa: S608
        (status, stage or status, json.dumps(error) if error else None, progress, subject_id),
    )
