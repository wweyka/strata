"""Worker entry point: `python -m strata_ai.worker.main`."""

import asyncio
import logging

from strata_ai.core.config import get_settings
from strata_ai.core.db import create_pool
from strata_ai.worker.queue import Handler, Worker

# Job handlers register here as each phase lands (ingestion in Phase 2, video in Phase 3).
HANDLERS: dict[str, Handler] = {}


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    pool = create_pool(settings.supabase_db_url.get_secret_value())
    await pool.open()
    try:
        await Worker(pool, settings, HANDLERS).run_forever()
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
