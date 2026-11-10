"""Event loops that psycopg's async mode can run on.

On Windows, asyncio and uvicorn default to the Proactor loop, which psycopg's async mode does not support.
These helpers pick a selector loop there and keep each runner's usual loop everywhere else.
"""

import asyncio
import sys
from collections.abc import Callable


def asyncio_loop_factory() -> Callable[[], asyncio.AbstractEventLoop] | None:
    """For `asyncio.run(..., loop_factory=...)`: None keeps the default loop."""
    return asyncio.SelectorEventLoop if sys.platform == "win32" else None


def uvicorn_loop() -> str:
    """For uvicorn's `loop` setting: a selector loop on Windows, uvicorn's usual choice elsewhere."""
    return "asyncio:SelectorEventLoop" if sys.platform == "win32" else "auto"
