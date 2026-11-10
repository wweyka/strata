"""Run the API: `uv run strata-api`. Works on Windows, macOS and Linux.

HOST and PORT default to 127.0.0.1:8000. Deployments run uvicorn directly (see the Dockerfile).
"""

import os

import uvicorn

from strata_ai.core.eventloop import uvicorn_loop


def main() -> None:
    uvicorn.run(
        "strata_ai.main:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        loop=uvicorn_loop(),
    )


if __name__ == "__main__":
    main()
