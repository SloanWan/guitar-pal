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
  ingest/      the whole-book pass: pdf.py (PyMuPDF boundary, OCR), tag.py
               (may_have_exercise rules), toc.py (outline → text TOC → vision TOC →
               whole book), model.py (the one model call), __main__.py (calibration by hand)
alembic/       migrations for user_books, book_chapters, book_pages
docs/          calibration.md — every number behind a rule, from real books
materials/     gitignored; real textbook excerpts the ingest tests run against
tessdata/      gitignored; Tesseract language data (tools/fetch-tessdata.sh)
tests/         pytest; nothing here needs a database, and the network only on opt-in
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
export ANTHROPIC_API_KEY=...           # optional: chapter finding on unbookmarked books
tools/fetch-tessdata.sh && export TESSDATA_PREFIX=$PWD/tessdata   # optional: OCR on scans

uvicorn app.main:create_app --factory --reload
```

Then set `BOOK_SERVICE_URL=http://localhost:8000` in the Next.js `.env.local` and run `npm run dev` as usual.

Without `BOOK_SERVICE_DATABASE_URL` the process still boots and `/health` answers; the book routes return 503.

## Tests and lint

```bash
pytest -q
ruff check . && ruff format --check .
```

The ingest tests run against two real excerpts in `materials/` (a typeset,
unbookmarked English chapter and a scanned Chinese one). The folder is
gitignored — textbooks are copyrighted — so those tests skip on a checkout
without it, CI included. One test makes a real model call and is opt-in:

```bash
BOOK_SERVICE_LIVE_MODEL=1 ANTHROPIC_API_KEY=... pytest -q -s tests/test_toc.py -k live
```

To see what the whole-book pass makes of any PDF on disk (no database, no
Storage), and to recalibrate the rules against a new book:

```bash
python -m app.ingest book.pdf          # outline, tags per rule, no model call
python -m app.ingest book.pdf --ocr    # OCR pages without a text layer (needs TESSDATA_PREFIX)
python -m app.ingest book.pdf --ask    # plus the text-TOC call; logs its token usage
python -m app.ingest book.pdf --tags   # every tagged page with the rules that fired
```

Numbers worth keeping go to `docs/calibration.md`; every rule with a number
in it points there.

## Scanned books

A page without a text layer is OCR'd with Tesseract (the library PyMuPDF's
wheel already carries; only the language files are needed —
`tools/fetch-tessdata.sh` locally, the Dockerfile in the image). About
2.5 s a page on one core, so a 300-page scan is a ~12-minute background
job. OCR keeps the prose (~85–90% of characters on the calibration book) and
loses decorative headings, diagrams and notation, which is why chapter
finding on a scan may still fall through to vision, and why the chapter
parse (#202) must treat `has_text_layer = false` as "look at the page" rather
than trusting the tag rules. `book_pages.text_source` records `layer`,
`ocr` or `none` per page.

An upload is often an excerpt — a chapter cut out of a book, no contents
page, maybe no chapter opener. Chapter finding does not depend on a contents
page (the model reads the first lines of every page), and when nothing is
found the book becomes one `manual` chapter spanning all of it, so the
player can open and parse it as is or split it by hand. It is never an
empty list.

What the text-TOC call costs: ~5 lines per page go to the model, so roughly
120 tokens a page — a 40-page book is ~6k input tokens, a 300-page one ~35k
(the digest caps itself there). Once per upload, never per chapter.

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
