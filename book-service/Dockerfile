# ---- deps: the dependency tree once, cached on pyproject.toml ----
FROM python:3.12-slim AS deps
WORKDIR /app
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
COPY pyproject.toml ./
# Dependencies only — the project itself is not installed, so the `app` package
# imported at runtime is the one copied below, not a stale copy in site-packages.
RUN pip install $(python -c "import tomllib; print(' '.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))")

# ---- runner ----
FROM python:3.12-slim AS runner
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN groupadd --system --gid 1001 book && useradd --system --uid 1001 --gid book book
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY --chown=book:book app ./app
COPY --chown=book:book alembic ./alembic
COPY --chown=book:book alembic.ini pyproject.toml ./
USER book
EXPOSE 8000
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
