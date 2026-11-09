"""Postgres access for the API and workers.

This connection uses the database owner role and bypasses RLS, so every query must filter
by the acting user's id explicitly.
"""

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


def create_pool(dsn: str) -> AsyncConnectionPool:
    return AsyncConnectionPool(
        dsn,
        min_size=1,
        max_size=10,
        open=False,
        kwargs={"row_factory": dict_row, "autocommit": True},
    )
