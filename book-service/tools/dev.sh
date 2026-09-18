#!/usr/bin/env sh
# The book service for local development, wired the way `npm run dev` expects:
# the repo's .env.local for Supabase and the model key, Tesseract data fetched
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

if [ -z "${TESSDATA_PREFIX:-}" ]; then
  [ -f "$here/tessdata/chi_sim.traineddata" ] || sh "$here/tools/fetch-tessdata.sh" "$here/tessdata"
  export TESSDATA_PREFIX="$here/tessdata"
fi

cd "$here"
exec .venv/bin/uvicorn app.main:create_app --factory --port "${BOOK_SERVICE_PORT:-8000}" --reload
