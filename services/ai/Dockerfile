# One image for both processes:
#   API:    uvicorn strata_ai.main:app --host 0.0.0.0 --port 8000
#   Worker: python -m strata_ai.worker.main
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY strata_ai ./strata_ai
RUN uv sync --frozen --no-dev
RUN useradd --create-home strata
USER strata
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "strata_ai.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
