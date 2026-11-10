"""Write every AI provider call to the ai_usage_events ledger, tagged with the running job."""

import logging

from psycopg_pool import AsyncConnectionPool

from strata_ai.providers.claude import LLMUsage
from strata_ai.worker.queue import CURRENT_JOB

log = logging.getLogger(__name__)


class UsageLedger:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self.pool = pool

    async def __call__(self, usage: LLMUsage) -> None:
        current = CURRENT_JOB.get()
        user_id, job_id = current if current is not None else (None, None)
        try:
            async with self.pool.connection() as conn:
                await conn.execute(
                    """insert into public.ai_usage_events
                         (user_id, job_id, provider, model, operation, input_units, output_units, unit,
                          cost_usd, latency_ms, status)
                       values (%s, %s, %s, %s, %s, %s, %s, 'tokens', %s, %s, %s)""",
                    (
                        user_id,
                        job_id,
                        usage.provider,
                        usage.model,
                        usage.operation,
                        usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens,
                        usage.output_tokens,
                        usage.cost_usd,
                        usage.latency_ms,
                        usage.status,
                    ),
                )
        except Exception:  # noqa: BLE001 - the ledger must never fail the work it records
            log.warning("could not record AI usage for %s", usage.operation, exc_info=True)
