# ---- deps: the dependency tree once, cached on pyproject.toml ----
FROM python:3.12-slim AS deps
WORKDIR /app
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
COPY pyproject.toml ./
# Dependencies only — the project itself is not installed, so the `app` package
# imported at runtime is the one copied below, not a stale copy in site-packages.
# rapid-layout goes in without its dependencies: it asks for opencv-python,
# which needs libGL on slim, and RapidOCR's opencv-python-headless serves it.
RUN pip install $(python -c "import tomllib; print(' '.join(d for d in tomllib.load(open('pyproject.toml','rb'))['project']['dependencies'] if not d.startswith('rapid-layout')))") \
    && pip install --no-deps "$(python -c "import tomllib; print(next(d for d in tomllib.load(open('pyproject.toml','rb'))['project']['dependencies'] if d.startswith('rapid-layout')))")"
# The OCR models (#417), fetched here at build time so no request ever
# downloads one. ocr.py imports no other app module, so it runs on its own.
COPY app/ingest/ocr.py /tmp/ocr.py
RUN python /tmp/ocr.py --fetch && rm /tmp/ocr.py

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
