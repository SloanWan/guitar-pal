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

## Why I built this

I picked up guitar in my twenties, and syncopation kept winning. The record went by too fast, and the page never quite lined up with the beat. I wanted something that loops a rhythm from slow to fast until it finally sits right.

Then there were the tabs: PDFs, random sites, YouTube, Bilibili, RedNote, a few bars in somebody's video. Every practice started with "_wait, where did I see that one?_" So **Guitar Pal** keeps them in one place and plays along with them, PDF or screenshot.

Reading a picture into a tab takes an AI model, and I'm one person with one wallet. So there's an **MCP server**: hook it up to your own AI chat, hand it the image, and get back a link that plays. Your AI does the reading, and I don't get the invoice ;)

And the name? I once had a job where we did stock checks on an app called myPal. That one counted boxes; this one counts beats. Hope it becomes your guitar practice pal.

## What's inside

- **Strum** — build a rhythm, drop a chord line on top, and hear a real guitar sample that rings into the next strum.
- **Tab** — play a tab back, loop the bar that keeps getting you, and see each note as a name, do re mi or 简谱. Triplets, 6/8, bends, slides and harmonics all actually sound.
- **Tab editor** — a grid, a fretboard that writes wherever your cursor is, and a panel for every technique you can think of.
- **Chords** — hundreds of chords, several shapes each, bass notes double-checked. Search by name, by a handful at once or by shape, then strum them.
- **Fretboard** — a scale across the whole neck, with a piano and a circle of fifths for company; lay a chord on top to see which notes are safe.
- **Books** — drop in a method book PDF (scans too) and get its exercises back as drafts you can play, right beside the page. Not open yet, but the sample book on the shelf is there to poke at.
- **Assistant** — type `C G Am F, slow folk strum` or paste an ASCII tab, and get a card you can play. Plain rules underneath ([grammar](docs/assistant-grammar.md)); General mode brings in a model.
- **Share links** — send a pattern to a friend; they can play it without signing up.
- **MCP server** — plug `/api/mcp` into Claude, Cursor or any MCP client, and whatever the model writes comes back as a link that plays ([setup](docs/mcp.md)).

No account? No problem, everything works signed out. Your stuff just lives in this browser and doesn't sync, so if you'd rather not sign up, think twice before clearing your browser data :)

## Plug it into your AI

The MCP server lives here, no account or key needed:

```
https://guitarpal.sloanwan.com/api/mcp
```

On claude.ai or Claude Desktop: Settings → Connectors → Add custom connector, paste the URL. From the terminal, Claude Code is one line:

```sh
claude mcp add --transport http guitar-pal https://guitarpal.sloanwan.com/api/mcp
```

Cursor (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "guitar-pal": { "url": "https://guitarpal.sloanwan.com/api/mcp" } } }
```

VS Code (`.vscode/mcp.json`):

```json
{ "servers": { "guitar-pal": { "type": "http", "url": "https://guitarpal.sloanwan.com/api/mcp" } } }
```

Then send it a photo of a tab and say "bring this into Guitar Pal". Other clients, the tools and the limits are in [docs/mcp.md](docs/mcp.md).

## Standing on the shoulders of

- [VexFlow](https://github.com/0xfe/vexflow): draws every tab stave
- [WebAudioFont](https://github.com/surikov/webaudiofontdata): the guitar and piano samples, bundled as JSON
- [chords-db](https://github.com/tombatossals/chords-db): the chord voicings, audited and fixed up here

## How it's built

- **Web app:** Next.js 16 (App Router), React 19, strict TypeScript, Tailwind CSS v4, and Radix primitives wearing a home-made design system (tokens in `src/app/tokens.css`, components in `src/components/ui/`).
- **Data and auth:** Supabase (Postgres, Auth, Storage) through thin query functions in `src/lib/`. No ORM. A guest's work stays in their browser.
- **Audio:** Web Audio with a lookahead scheduler. Every string is its own sampled voice, scheduled ahead and left to ring.
- **Assistant:** rule-based readers for strum and tab sentences (`src/lib/assistant/`). General mode runs a model (DeepSeek or Claude) that calls those same readers as tools, so the model does the talking and the readers make every card. An offline eval set keeps it honest.
- **Book import:** `book-service/`, a Python sidekick (FastAPI, asyncpg, LangGraph, PyMuPDF, PP-OCR) the app proxies to. Its [README](book-service/README.md) has the rest.
- **Tests and CI:** Vitest, a Playwright smoke suite and pytest, run by GitHub Actions on every PR alongside CodeQL. A green `main` ships itself to the server in Docker.

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
