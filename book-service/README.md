# book-service

The Python half of textbook import (#200): upload a PDF, see its chapters, parse a chapter into practice drafts, ask the chapter questions. Next.js proxies `/api/books/*` here with the player's Supabase session token; this service verifies it and reads and writes its own tables directly. Nothing else in the app moves.

Thin on purpose: FastAPI, asyncpg with plain SQL, Alembic for its own tables, `BackgroundTasks` for the long jobs. No ORM, no queue.

## Layout

```
app/
  main.py      app factory, lifespan, /health, /me
  config.py    Settings — everything read from the environment
  auth.py      Supabase JWT verification (JWKS, HS256 fallback), the CurrentUser dependency
  db.py        the asyncpg pool; stale-scan cleanup at startup
alembic/       migrations for user_books, book_chapters, book_pages
tests/         pytest; nothing here needs a database or the network
```

## Run it locally

```bash
cd book-service
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# The same names the Next.js .env uses; NEXT_PUBLIC_SUPABASE_URL is enough for
# JWT verification on a project with asymmetric signing keys.
export NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
export BOOK_SERVICE_DATABASE_URL=postgresql://book_service:<password>@<pooler host>:6543/postgres
# export SUPABASE_JWT_SECRET=...      # legacy HS256 projects only

uvicorn app.main:create_app --factory --reload
```

Then set `BOOK_SERVICE_URL=http://localhost:8000` in the Next.js `.env.local` and run `npm run dev` as usual.

Without `BOOK_SERVICE_DATABASE_URL` the process still boots and `/health` answers; the book routes return 503.

## Tests and lint

```bash
pytest -q
ruff check . && ruff format --check .
```

CI runs both (`.github/workflows/ci.yml`, job `book-service`). The husky pre-commit hook is Node-only; run these by hand before pushing Python changes.

## Database

Two roles, two URLs:

| Variable | Role | Used by |
|---|---|---|
| `BOOK_SERVICE_DATABASE_URL` | `book_service` — DML on the book tables and nothing else | the running service |
| `BOOK_SERVICE_MIGRATION_DATABASE_URL` | an admin role (`postgres`), **session** pooler on port 5432 (`postgres.<ref>@aws-0-<region>.pooler.supabase.com`; the direct `db.<project>` host is IPv6-only) | `alembic`, by hand |

Setup, once per Supabase project:

1. `scripts/create-book-service-role.sql` in the SQL editor — set a real password first.
2. `scripts/create-books-bucket.sql` — the private `books` bucket and its Storage policies.
3. `BOOK_SERVICE_MIGRATION_DATABASE_URL=... alembic upgrade head`

Migrations create their tables and grant on them to `book_service` in the same revision, so the role's reach is readable per table. The alembic version table is `book_service_alembic_version`, apart from anything else in the schema.

Why two ports on the same pooler host: 6543 is transaction mode, fine for the service's short queries (the pool sets `statement_cache_size=0` for it) and wrong for a migration that needs one session for its whole transaction; 5432 is session mode.

## Ownership

Row-level security is not what keeps one user out of another's books here. The service connects as one role for everyone, so it filters by the `user_id` read from a **verified** JWT on every query — that check is the whole model. RLS is still on, with a single policy for `book_service`, and the grants Supabase gives `anon` / `authenticated` on new public tables are revoked, so the browser's PostgREST path sees nothing.

Storage works the other way round: the browser uploads straight to the `books` bucket with the player's own session, and this service reads the file back with the same token the proxy forwards. The bucket's policies compare the path's first folder to `auth.uid()`. No service-role key on the server.
