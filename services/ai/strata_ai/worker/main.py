"""Worker entry point: `uv run strata-worker` (or `python -m strata_ai.worker.main`)."""

import asyncio
import logging

from strata_ai.core.config import get_settings
from strata_ai.core.db import create_pool
from strata_ai.core.eventloop import asyncio_loop_factory
from strata_ai.ingest.pipeline import ingest_handler
from strata_ai.worker.queue import Handler, Worker
from strata_ai.worker.usage import UsageLedger


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    settings = get_settings()
    pool = create_pool(settings.supabase_db_url.get_secret_value())
    await pool.open()
    # Job handlers register here as each phase lands (video in Phase 3). A handler whose
    # provider keys are missing is left out, and its jobs are parked as awaiting credentials.
    handlers: dict[str, Handler] = {}
    ingest = ingest_handler(settings, pool, UsageLedger(pool))
    if ingest is not None:
        handlers["ingest_material"] = ingest
    try:
        await Worker(pool, settings, handlers).run_forever()
    finally:
        if ingest is not None:
            await ingest.aclose()
        await pool.close()


def run() -> None:
    asyncio.run(main(), loop_factory=asyncio_loop_factory())


if __name__ == "__main__":
    run()
