# book-service

The Python half of textbook import (#200): upload a PDF, see its chapters, parse a chapter into practice drafts, ask the chapter questions. Next.js proxies `/api/books/*` here with the player's Supabase session token; this service verifies it and reads and writes its own tables directly. Nothing else in the app moves.

Thin on purpose: FastAPI, asyncpg with plain SQL, Alembic for its own tables, `BackgroundTasks` for the long jobs. No ORM, no queue.

## Layout

```
app/
  main.py      app factory, lifespan, /health, /me; wires Storage, OCR, the model reader
  config.py    Settings — everything read from the environment
  auth.py      Supabase JWT verification (JWKS, HS256 fallback), the CurrentSession dependency
  db.py        the asyncpg pool; stale-scan cleanup at startup
  books.py     the /books routes and the manual-range validation
  repo.py      the book tables as plain SQL, every query filtered by user_id
  scan.py      the background whole-book scan (download → pages/OCR → tags → chapters)
  storage.py   Supabase Storage as the player (download, delete)
  ingest/      the whole-book pass: pdf.py (PyMuPDF boundary, OCR), tag.py
               (may_have_exercise rules), toc.py (outline → text TOC → vision TOC →
               whole book), model.py (the one model call), __main__.py (calibration by hand)
  parse.py     the chapter parse job (pages → graph → notes/exercises/chunks, cost, warnings)
  graph/       the parse as a LangGraph: classify pages, knowledge points, route to extractors
  extract/     the type-specific readers; tab.py (six-line tab + jianpu → fingerpick drafts)
  validate.py  the one draft validator, called on the Next.js side
alembic/       migrations for user_books, book_chapters, book_pages, and the parse tables
docs/          calibration.md — every number behind a rule, from real books
materials/     gitignored; real textbook excerpts the ingest tests run against
tessdata/      gitignored; Tesseract language data (tools/fetch-tessdata.sh)
tests/         pytest; nothing here needs a database, and the network only on opt-in
```

## Run it locally

Once:

```bash
cd book-service
python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"
```

Then, from the repo root, beside `npm run dev`:

```bash
npm run dev:books
```

That is `tools/dev.sh`: it loads the repo's `.env.local` (the same
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`BOOK_SERVICE_DATABASE_URL` and `ANTHROPIC_API_KEY` the Next.js side uses),
fetches the Tesseract data on first run, and starts `uvicorn` on port 8000
with reload. `.env.local` also needs `BOOK_SERVICE_URL=http://localhost:8000`
so the Next.js proxy finds it. `BOOK_SERVICE_PORT` overrides the port.

By hand, the same thing is:

```bash
cd book-service && set -a && . ../.env.local && set +a
TESSDATA_PREFIX=$PWD/tessdata .venv/bin/uvicorn app.main:create_app --factory --reload
```

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

The chapter parse has the same kind of switch — the whole graph over a page
range, no database, drafts printed and crops written next to you:

```bash
python -m app.graph book.pdf --pages 24-32 --ocr            # classify + knowledge points
BOOK_SERVICE_VALIDATE_URL=http://localhost:3000 BOOK_SERVICE_INTERNAL_SECRET=... \
python -m app.graph book.pdf --pages 3-3 --ocr --crops /tmp/crops --dump /tmp/drafts.json
```

With the validator reachable (a Next.js dev server) the extractors run and
every tab exercise comes out as a draft; without it, notes only.

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

## The API

All routes take the player's Supabase session as `Authorization: Bearer`
(the Next.js proxy forwards it) and answer only for that player's books —
another user's book is a 404, the same as no book.

| route | what |
|---|---|
| `POST /books` `{title}` | the row and its `storage_path` (`{user_id}/{book_id}.pdf`). The browser then uploads the PDF straight to the `books` bucket at that path with its own session. |
| `POST /books/{id}/scan` | starts the whole-book pass in the background; 202 with the row, 409 if already scanning. Rescanning a `ready` or `failed` book is allowed and replaces its pages and chapters. |
| `GET /books` | the player's books, newest first |
| `PATCH /books/{id}` `{title}` | rename |
| `GET /books/{id}` | the book with `status`, `scanned_pages` / `page_count` for progress, `error`, and its chapters with `exercise_hint_count` |
| `PUT /books/{id}/chapters` `{chapters: [{title, page_start, page_end}]}` | the player's own ranges: sorted, inside the book, non-overlapping (gaps allowed). `toc_source` becomes `manual`; hint counts are recomputed from the tagged pages. |
| `DELETE /books/{id}` | the PDF (as the player) and every row under the book |
| `POST /books/{id}/chapters/{chapter_id}/parse` | starts the chapter parse (#202) in the background; 202, 409 if already parsing, 422 over the 40-page cap. Re-parsing replaces what the chapter had. |
| `GET /books/{id}/chapters/{chapter_id}/parse` | the chapter with its `parse_status`, `parse_error` and `parse_cost`, and once ready its `notes` (knowledge points) and `exercises` (drafts). Poll this. |

A scan reads the PDF with the session token from the request that started
it, then never needs it again; the model call, if any, uses the server's
`ANTHROPIC_API_KEY`. One scan runs at a time per process (OCR is a core's
worth of work); others queue behind it while their status already says
`scanning`.

Without `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the service there is no Storage
client and the scan and delete routes answer 503, like the book routes do
without a database.

The whole flow against the real project is `tests/test_live_books.py`,
opt-in with a session token (its docstring says how). It uploads the typeset
excerpt, scans it, edits its chapters and deletes it again.

## The chapter parse

`app/parse.py` runs the job, `app/graph/` is the LangGraph inside it:
every page classified in its own branch (text, plus the page image for
pages without a text layer or tagged `may_have_exercise`), the knowledge
points in one call over the chapter text alongside, then each classified
page routed to its reader in `app/extract/`, and every draft validated
through Next.js's `POST /api/internal/validate` (`app/validate.py`;
`BOOK_SERVICE_VALIDATE_URL` + `BOOK_SERVICE_INTERNAL_SECRET`). A rejected
draft goes back to the model once with the errors; a second rejection drops
it and leaves a warning on the chapter (`parse_warnings`). Without an API
key the parse still runs: text chunks only; without the validator, notes
but no drafts. What each parse spent is on the chapter row.

The tab reader (`extract/tab.py`, #202 B5) finds the exercises on a page
with a cheap call, crops each at 150 dpi and reads it with the parse model
as two independent readings — the six-line tab and, when the book prints
one, the jianpu row under it — which the service compares note by note.
Frets are the tab's; a disagreement is a warning that names both readings.
The crop it read goes beside the PDF in Storage (`crop_path`). Tab in a
PDF's text layer is not read (#228). The numbers behind every choice here
are in `docs/calibration.md` §6.

## Database

Two roles, two URLs:

| Variable | Role | Used by |
|---|---|---|
| `BOOK_SERVICE_DATABASE_URL` | `book_service` — DML on the book tables and nothing else | the running service |
| `BOOK_SERVICE_MIGRATION_DATABASE_URL` | an admin role (`postgres`), **session** pooler on port 5432 (`postgres.<ref>@aws-0-<region>.pooler.supabase.com`; the direct `db.<project>` host is IPv6-only) | `alembic`, by hand |

Setup, once per Supabase project:

1. `scripts/create-book-service-role.sql` in the SQL editor — set a real password first.
2. `scripts/create-books-bucket.sql` — the private `books` bucket and its Storage policies.
3. `BOOK_SERVICE_MIGRATION_DATABASE_URL=... alembic upgrade head` — again after
   every pull that adds a revision under `alembic/versions/`

Migrations create their tables and grant on them to `book_service` in the same revision, so the role's reach is readable per table. The alembic version table is `book_service_alembic_version`, apart from anything else in the schema.

Why two ports on the same pooler host: 6543 is transaction mode, fine for the service's short queries (the pool sets `statement_cache_size=0` for it) and wrong for a migration that needs one session for its whole transaction; 5432 is session mode.

## Ownership

Row-level security is not what keeps one user out of another's books here. The service connects as one role for everyone, so it filters by the `user_id` read from a **verified** JWT on every query — that check is the whole model. RLS is still on, with a single policy for `book_service`, and the grants Supabase gives `anon` / `authenticated` on new public tables are revoked, so the browser's PostgREST path sees nothing.

Storage works the other way round: the browser uploads straight to the `books` bucket with the player's own session, and this service reads the file back with the same token the proxy forwards. The bucket's policies compare the path's first folder to `auth.uid()`. No service-role key on the server.
