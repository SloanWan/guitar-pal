# e2e

Playwright, against a real browser (#259). Two tiers, kept apart by what they
need.

## smoke — what CI runs

One short path per page, signed out. Progressions live in localStorage without
an account, so nothing here writes a row and there is nothing to clean up.

```bash
npm run test:e2e            # builds, serves on 3100, runs smoke + account
```

Iterating is faster against a server you already have:

```bash
npm run dev                                   # in another shell
E2E_BASE_URL=http://localhost:3000 npx playwright test --project=smoke
```

`next start` warns that it "does not work with output: standalone" — it does;
the warning is about the intended Docker deployment, and the middleware
redirects and server components all answer normally under it.

## account — the sign-in flow

Skips itself unless `E2E_EMAIL` / `E2E_PASSWORD` name a confirmed user in the
Supabase project. Nothing is written beyond the session. `/home` and
`/settings` are the only guarded pages; the players are open to everyone.

## share

`E2E_SHARE_ID` is a public share that already exists in the project. One is
not created per run: that would need an account and would leave rows behind.

## books — local, by hand

Textbook import, browser → the Next.js proxy → the Python service → Supabase.
Needs `npm run dev` and `npm run dev:books` both up, a PDF on disk, and
minutes of OCR, so it is never on the CI path and exists as a Playwright
project only when `E2E_BOOKS` is set.

```bash
E2E_BOOK_PDF=book-service/materials/<some>.pdf \
E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e:books
```

The parse step calls the model and costs money, so it is opt-in again with
`E2E_BOOKS_PARSE=1`. The book is deleted at the end either way.

## Writing one

- Select by role and accessible name. Where a component has no name, give it an
  `aria-label` — the app is already labelled almost everywhere, and a label a
  screen reader can use is worth more than a `data-testid`.
- Assert on state the UI actually shows. Both players label their transport by
  what it will do next ("Play" → "Loading samples" → "Stop"), so the label is
  the state; there is no playhead attribute to read and none should be added
  for a test.
- Every spec fails on an uncaught page exception (`e2e/fixtures.ts`). That is
  most of the point: a component that throws on mount still renders a shell.
