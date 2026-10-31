<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/guitar-pal-logo-mark-dark.svg" />
    <img src="public/guitar-pal-logo-mark.svg" width="72" alt="" />
  </picture>
</p>

<h1 align="center">Guitar Pal</h1>

<p align="center">
  A practice studio for guitar lovers who would rather play than squint at PDFs.<br/>
  <a href="https://guitarpal.sloanwan.com"><b>guitarpal.sloanwan.com</b></a>
</p>

## What's inside

- **Strum** — build a rhythm, type a chord line over it, and hear it on a real
  guitar sample that keeps ringing into the next strum.
- **Tab** — play a tab back, loop the hard bar, and read the note under each fret
  as a name, do re mi or 简谱. Triplets, 6/8, bends, slides and harmonics all sound.
- **Tab editor** — a grid, a fretboard that writes at the cursor, and an inspector
  for every technique.
- **Chords** — hundreds of chords with several voicings each (bass notes checked);
  search by name, by a few at once or by shape, and play them through.
- **Fretboard** — a scale across the neck with a piano and a circle of fifths;
  lay a chord over it to find the safe notes.
- **Books** — upload a method PDF, scans included, and get its exercises back as
  playable drafts beside the page they came from.
- **Assistant** — type `C G Am F, slow folk strum` or paste an ASCII tab and get a
  card you can play. Read by plain rules
  ([grammar](docs/assistant-grammar.md)); General mode adds a model on top.
- **Share links** — anyone can play a shared pattern without signing up.
- **MCP server** — connect `/api/mcp` to Claude, Cursor or any MCP client; what
  the model writes comes back as a link that plays ([setup](docs/mcp.md)).

Everything but uploading a book works without an account.

## Standing on

- [VexFlow](https://github.com/0xfe/vexflow): draws every tab stave
- [WebAudioFont](https://github.com/surikov/webaudiofontdata): the guitar and piano samples, bundled as JSON
- [chords-db](https://github.com/tombatossals/chords-db): the chord voicings, audited and corrected here

## How it's built

- **Web app:** Next.js 16 (App Router), React 19, TypeScript in strict mode,
  Tailwind CSS v4, Radix primitives under a design system of its own (tokens in
  `src/app/tokens.css`, components in `src/components/ui/`).
- **Data and auth:** Supabase (Postgres, Auth, Storage), read through thin
  query functions in `src/lib/`, no ORM. A guest's work stays in the browser.
- **Audio:** the Web Audio API with a lookahead scheduler. Each string is its
  own sampled voice, scheduled ahead of time and left to ring.
- **Notation:** VexFlow draws the tab staves.
- **Assistant:** rule-based readers for strum and tab sentences
  (`src/lib/assistant/`). General mode runs a model (DeepSeek or Claude) that
  calls those same readers as tools, so every card comes from a reader. An
  offline eval set keeps score.
- **Book import:** `book-service/`, a Python service (FastAPI, asyncpg,
  LangGraph, PyMuPDF and Tesseract) the app proxies to. See its
  [README](book-service/README.md).
- **Tests and CI:** Vitest unit tests, a Playwright smoke suite and pytest for
  the book service, run by GitHub Actions on every pull request alongside
  CodeQL. A green `main` deploys to the server with Docker.

## Repo layout

```
src/app/         routes: the pages, auth, api/ (assistant, books proxy, MCP); dev/ labs are off in production
src/components/  feature components by area: strum, fingerpick, chords, assistant, books, …
src/lib/         the logic: pattern models, schedulers, chord data, assistant readers
book-service/    the Python book-import service
e2e/             Playwright suites
scripts/         SQL migrations and one-off data scripts
docs/            assistant grammar, MCP setup
```

## License

All rights reserved. See [LICENSE](LICENSE).
