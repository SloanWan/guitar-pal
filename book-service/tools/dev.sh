#!/usr/bin/env sh
# The book service for local development, wired the way `npm run dev` expects:
# the repo's .env.local for Supabase and the model key, the OCR models fetched
# on first run, uvicorn on 8000 with reload. Run as `npm run dev:books`.
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/.." && pwd)"

if [ ! -x "$here/.venv/bin/uvicorn" ]; then
  echo "book-service/.venv is missing. Once:" >&2
  echo "  cd book-service && python3.12 -m venv .venv && .venv/bin/pip install -e '.[dev]'" >&2
  exit 1
fi

if [ -f "$root/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$root/.env.local"
  set +a
else
  echo "no .env.local at the repo root; the service will boot without a database" >&2
fi

# The OCR models (#417), downloaded on first run; the service never fetches them itself.
(cd "$here" && .venv/bin/python -m app.ingest.ocr >/dev/null 2>&1) \
  || (cd "$here" && .venv/bin/python -m app.ingest.ocr --fetch)

cd "$here"
exec .venv/bin/uvicorn app.main:create_app --factory --port "${BOOK_SERVICE_PORT:-8000}" --reload
