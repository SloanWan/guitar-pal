# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
npm test         # Run Vitest test suite
npm run test:e2e # Build, serve on 3100, run the Playwright smoke suite (e2e/README.md)
```

A pre-commit hook (`.husky/pre-commit`) runs `tsc --noEmit`, `npm run lint`, and `npm test` before every commit — fix all three before pushing. The hook does not run the e2e suite (it builds and drives a browser); CI does.

## Stack

- **Next.js 16.2.10** (App Router) with React 19 — check `node_modules/next/dist/docs/` before using Next.js APIs, as this version may differ from training data
- **Supabase** (`@supabase/ssr`) for auth and database
- **Tailwind CSS v4** for styling
- **shadcn/ui** components (Radix UI primitives) in `src/components/ui/`
- **VexFlow** for TAB rendering (fingerpicking feature)
- **webaudiofontdata CDN** (`surikov.github.io/webaudiofontdata`, GPL-3.0) — guitar sample data fetched at runtime; the `webaudiofont` npm package is not used
- **Vitest** for unit tests
- **TypeScript** (strict mode) throughout

## Architecture

**Auth flow:** `/auth` handles sign-in/sign-up via `src/lib/auth.ts`. `src/proxy.ts` is the Next.js 16 middleware entry point (named `proxy.ts`, not `middleware.ts`) and its matcher runs on nearly every request, not a route list — it refreshes the session cookie on each one, so a redirect has to carry those cookies across (`redirectWithCookies`) or the refresh is dropped. A request that cannot reach Supabase is treated as signed out rather than thrown, so the public pages still render.

- `/home` and `/settings` are the signed-in personal surfaces, matched **exactly**, not as prefixes. A signed-out visitor goes to `/auth?redirect=…` and lands back after signing in.
- `/` is the public hub. A signed-in visitor is sent to `/home`; a signed-out one stays, deliberately (#127).
- `/auth` sends a signed-in visitor to the `redirect` param when `safeRedirectPath` accepts it, else to `/home`.
- `/books` is open to everyone (#262) — uploading asks for an account on the page, not at the door.
- `/dev` with `NEXT_PUBLIC_ENABLE_DEV_ROUTES` unset returns unchanged so the dev layout can 404 it; redirecting there would leak that the route exists. With the flag on, `/dev/dashboard` and `/dev/session` are the only ones that require a user.

Everything else is public.

**Two Supabase clients:**

- `src/lib/supabase.ts` — `createClient()` via `createBrowserClient`, used in client components and all lib query functions
- `src/lib/supabase-server.ts` — `createSupabaseServer()` via `createServerClient` + `cookies()`, used only in server components and route handlers (`(main)/p/[id]/page.tsx`, `api/assistant/route.ts`, `api/books/[...path]/route.ts`, `dev/dashboard/page.tsx`). Note the chord pages are **not** on this path: they read through `chordsData.ts`, which uses a cookie-free `@supabase/supabase-js` client so `unstable_cache` can wrap the reads

Never mix the two clients — `createSupabaseServer()` throws at runtime in client components.

Env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Data layer:** `src/lib/` contains thin Supabase query functions — no ORM, no server actions (except the two chord reads client components make, in `chords.ts`). All DB calls happen client-side. Lib functions throw on Supabase error rather than returning null. Tables:

- `exercises`, `routines`, `routine_exercises` (join table with `order_index` and `duration_minutes`)
- `practice_logs` — immutable records written at end of a session
- `exercise_logs` — per-exercise records (currently unused by any UI)
- `user_strum_patterns`, `user_favourite_patterns` — custom strum pattern storage
- `user_pattern_progressions` — chord sequences a user attached to a strum pattern (`pattern_id` is a plain text id, not a foreign key: a progression can hang off a preset pattern as well as a custom one)
- `chords`, `chord_voicings` — shared/read-only reference data

Types defined in `src/types/database.ts`.

**Strumming machine audio engine** (`src/components/strum/`):

- `useAudioEngine.ts` — setTimeout-based lookahead scheduler (100 ms window, 25 ms reschedule). All scheduler-read state lives in `useRef`, never `useState`, to avoid stale closures and re-render-triggered timing drift. Do not read `ref.current` values inside React render logic.
- `useGuitarSampleLoader.ts` — fetches and parses WebAudioFont preset data from the pinned CDN (`surikov.github.io/webaudiofontdata`). Presets are JS object literals, not strict JSON — parsed via sandboxed `new Function()` evaluation, not `JSON.parse` or a hand-rolled tokenizer (this was tried and repeatedly broke on real CDN content — do not reintroduce a custom parser). Exposes `triggerStrum(type, ctx, target, when, noteDuration, customPitches?)`, which directly schedules one `AudioBufferSourceNode` per string (5 strings, 10 ms stagger, 0.9× volume taper) using the Web Audio API. `customPitches` carries the sounding bar's chord (resolved by `resolveBarChords`); without it the default C-major voicing (MIDI [48, 52, 55, 60, 64]) plays. The `WebAudioFontPlayer` class is not used. Down strum: low→high pitch order; up strum: high→low. Exposes `preloadStrumPresets(ctx)` (call once on playback start) and `cancelStrums()` (call on stop and unmount).
- Struck strings **let ring**: down/up strums decay over `STRUM_RING_SECONDS` (1.5 s, τ = ring/3) regardless of tempo, so consecutive strums overlap the way a real guitar does. `noteDuration` (= `secondsPerCell`) now only bounds the muted chuck, which stays capped at `MUTED_MAX_DURATION_S` and keeps the BPM-scaled decay. Play-once therefore waits a full ring before `cancelStrums()`, or it clips its own closing chord. Settings were chosen in `/dev/strum-sound-lab`.

**Strum pattern model** (`src/lib/strumPatterns.ts`, `strumBars.ts`, `strumNotation.ts`, `strumProgressions.ts`, `strumGridLayout.ts`):

- A `StrumPattern` is **one bar of rhythm** — `{ id, name, beats, bpm? }`. It carries no chord and no stored description: the pattern tab's chord picker is session-only, and the description is written from `beats` by `patternNotation` (one character per cell, blanks where nothing is struck, so `whitespace-pre` + a mono font are required wherever it is rendered).
- A `ChordProgression` is a chord sequence written over a pattern: `Bar[]` (each bar its own rhythm + `ChordRef`), plus an optional name and tempo, stored per user in `user_pattern_progressions`. Unnamed progressions are listed by their chord abbreviations (`"C|G|Am|F"`). New ones are typed as a chord line in the workspace (`parseChordSequence` resolves each word through the same ranked search the chord picker uses); the multi-bar editor only edits existing ones.
- `toBars(pattern)` is still the single read path (a pattern is one chordless bar); `resolveBarChords` is the `ChordRef` → MIDI boundary.
- Grid width is computed, not guessed: beats pad out to four columns (`strumGridLayout.ts`), so bars run 12–16 columns and only short bars pair up two per row. The per-cell minimum widths there mirror Tailwind classes in `StepGrid` — change both together.
- Deleting a pattern must cascade: its progressions and its favourite record go with it.

**Fingerpicking feature** (`src/lib/fingerpickTypes.ts`, `src/lib/fingerpickToVexFlow.ts`, `src/components/fingerpick/`):

- Data model in `fingerpickTypes.ts`: `FingerpickPattern` → `Measure[]` → `BeatSlot[]`. Each `BeatSlot` holds 6 `StringFret` entries (fret, technique, tied, muted flags) and a `Duration`. `Technique` covers hammer-on, pull-off, slide-up, slide-down.
- `fingerpickToVexFlow.ts` converts a `Measure` into VexFlow `TabNote`, `GhostNote`, `TabTie`, `TabSlide`, and `Beam` objects for stave rendering.
- `TabStaveRow.tsx` renders a row of tab staves using those VexFlow objects.
- **Meter model is shared with strum** (`src/lib/strumMeter.ts`): a compound meter (6/8, 12/8) is counted in dotted-quarter beats, never in eighths. `beatTicks(ts)` in `fingerpickEdit.ts` is the only way to get "the beat" (24 or 36 ticks of 96 per whole note); nothing reads the denominator directly. **BPM counts the beat** (♩ = 90 in 4/4, ♩. = 60 in 6/8) — `secondsPerQuarter(bpm, ts)` in `fingerpickScheduler.ts` is the one place the meter enters timing, and `changeTimeSignature` rescales the tempo across simple ↔ compound so the eighth note keeps its speed.
- **Pitch is one formula** (`src/lib/fingerpickPitch.ts`): `soundingMidi(string, fret, capo)` is what the scheduler compiles events through and what the reading page's Pitch column (`TabStaveRow`'s `pitchLabel` prop, raw SVG `<text>` under the stems, footroom computed like the chord line's headroom) writes under each fret, so label and audio cannot disagree. `pitchLabel(midi, style)` spells names by `ROOT_CHROMATIC_ORDER`; the `jianpu` style is fixed-do in C with the undotted octave at sounding C3–B3 (guitar is written an octave up), octave dots carried as combining marks that `splitPitchLabel` strips for drawing. The column's labels widen a measure's minimum width (`pitchLabelWidths` in `computeMeasureMinWidth`); the toggle and style are device-local prefs.
- The chord line's shape view can write each chord's tones beside its strip (`chordToneNames` in `fingerpickChords.ts`: `chordTones` by interval, the voicing's notes as fallback), sized with the strip by `chordToneFontSize`; `chordShapeSize.width` in the workspace grows by the widest tone line so lanes and the row edge are laid out for the whole overlay.
- **Triplets are groups**: `tripletGroups(slots)` (three consecutive same-value triplet slots, chunked from the run start) is the single grouping the grid bracket, the VexFlow `Tuplet` and every structural edit read — deleting, duplicating or inserting around a member acts on the whole group. Triplet entry points are hidden when `isCompound(ts)`.

**Assistant** (`src/lib/assistant/`, `src/components/assistant/`) — one chat panel, three modes on a chip: `Strum | Tab` read by rules, `General` is the model with those readers as tools.

- `src/lib/assistant/` is the shared core: `lang`, `blank`, `smallTalk`, `greeting`, `missLog`, `rateLimit`, `fuzzy`, `chordSpelling`, `conversation` (transcript + mode storage), `handoff` (the envelope: stash / take / event, kinds from both domains), `readAs` (the safety net, below) and `types`. `strum/` holds the strum readers (`router`, `readPhrase`, `readCapo`, `parseRhythm`, `buildProposal`, `editIntent`, `suggest`, `turn`, `typos`); `tab/` holds the fingerpick readers (`parsePickOrder`, `parseAsciiTab`, `parseStringFret`, `readTabSentence`, `buildTabProposal`, `editIntent`, `router`, `turn`). `__evals__/` is the offline eval set (`cases.ts`, strum; `tabCases.ts`, tab) plus `general.eval.ts`, the paid run (`npm run evals`, `ASSISTANT_MODEL=` to pick the model, `ASSISTANT_EVAL_RUNS=3` to run each case three times and tell flaky from never; writes `baseline.json` per model).
- Components mirror it: `AssistantLauncher`, `AssistantPanel`, `Options`, `useAssistant` are domain-free; `strum/` and `tab/` hold the proposal and edit cards. A card navigates to its own page before applying, so it may render on either page.
- **The mode is the player's, never guessed.** A new thread opens in the current page's mode (`domainForPath`), and talking settles it (`writeMode`). The page only proposes: when mode and page disagree on `/strum` or `/fingerpick`, a one-line "Switch to … for this page?" shows once per page, answered by typing or by choosing. The one safety net is `otherDomainReads` in `readAs.ts`: when the chosen readers made nothing of a sentence (no card) and the other domain's router or edit reader reads it, the reply carries a "Read as … instead" option. Do not add rules that pick a domain from the sentence.
- **General** (`src/lib/assistant/general/`, `src/app/api/assistant/route.ts`): the route is a stateless proxy — one model step per call. Signed-in users get a per-call rate limit; a guest gets `GUEST_TURN_LIMIT` turns a day counted in a signed HttpOnly cookie (`general/guest.ts`, keyed by the client's `turnId` so a loop counts once), under an hourly per-IP cap and a daily all-guests budget (`ASSISTANT_GUEST_DAILY_CALLS`, default 300); the panel shows "n of 3 free today" and locks the segment when they are used. The loop runs on the client (`resolveGeneralTurn` in `general/turn.ts`, at most `MAX_CALLS` model calls a turn): the model calls `read_*` / `edit_*` with the player's **original sentence** (never a rewrite) and the browser runs the same readers a rules turn runs; `propose_strum` / `propose_tab` let the model compose, and `buildProposal` / `parseAsciiTab` + `normalizeImportedPattern` validate before anything is shown, errors going back as `is_error` tool results for one repair. **A card is always a reader's; the model's text is narration.** `tools.ts` and `prompt.ts` are per-request-free and sit in the cached prefix; per-player context rides on the turn's user message (`request.ts`). The model is `MODEL` in `request.ts` (`ASSISTANT_MODEL` env overrides; default `deepseek-flash`, chosen on the eval set in #255); thinking/effort are set per model family there, and `vendor.ts` picks the vendor by the model's name (`deepseek-*` → DeepSeek's Anthropic-compatible endpoint with `DEEPSEEK_API_KEY`, `claude-*` → Anthropic with `ANTHROPIC_API_KEY`) for the route and the eval runner alike.
- **One transcript, shared across pages** (`conversation.ts`, one sessionStorage key). Messages carry their `domain`; the card a reply renders is chosen by what the message holds, never by the current page. General is shown the transcript as text only, the last `MAX_HISTORY_TURNS`.
- The shared core imports from `strum/` in two places by design (`missLog`'s `EditIntentExplanation`, which both turns produce for a miss; `readAs`, which runs both domains' readers), `general/` imports both domains, and `tab/` reaches into `strum/` for `withoutCapo`, `blankSpan`, `Guidance` and `explainEditIntent`. Keep it at that — don't add new core → domain imports.
- Storage keys are `guitarpal:assistant*`.
- The sentence grammar the rules readers understand is written down in `docs/assistant-grammar.md` (English forms only, no Chinese characters) and `docs/assistant-grammar.zh.md` (Chinese, listing both languages' forms; same outline, and its example blocks minus the Chinese lines are the English page's — a test checks all of this), served at `/docs/assistant-grammar` with `?lang=`. When a token or sentence form is added to a reader, update both pages and the `general/tools.ts` descriptions together.

**Exercise categories** are a fixed `as const` array exported as `CATEGORIES` from `src/types/database.ts`: `"chord" | "chord_change" | "picking" | "scale" | "strumming" | "fingering" | "ear_training" | "arpeggio" | "theory" | "song"`.

**Session flow:** `/dev/session/[routineId]` — a dev-only surface behind `NEXT_PUBLIC_ENABLE_DEV_ROUTES`, not a user route. A client component with a local timer state machine (`idle → running → paused → completed → all_done`). On `all_done`, it collects rating + notes and calls `createPracticeLog()`, then pushes to `/dev/dashboard`.

**Component pattern:** Feature components (e.g. `ExerciseList`, `RoutineList`) live in `src/components/` and are marked `"use client"`. They handle their own data fetching and local state. UI primitives from shadcn live in `src/components/ui/` — don't hand-edit these unless necessary.

## Conventions

- Ghost strokes (`"DG"`/`"UG"`) are **drawn, not stored**: `ghostedBeats` in `strumGridLayout.ts` derives them from the struck cells where the grid is rendered. A stored `StepValue` is only `"D" | "U" | "X" | ""`; the retired `DG`/`UG`/`D3`/`U3` values are folded away by `normalizeBeats` (`strumBars.ts`) as rows are read. Never write a ghost into stored beats, a parser result, or an audio engine structure.
- `CATEGORY_COLORS` is centrally managed in `src/lib/constants.ts`; styling uses Tailwind v4 arbitrary value syntax `bg-[#hex]`.
- Brand color (denim): `#4A6FA5` (denim — active/main), `#6B8CAE` (denim-light — muted/rings), `#EEF2F7` (denim-tint — bg), `#3A5A8A` (denim-dark — deep hover). Use Tailwind class names (`text-denim`, `bg-denim-tint`, `border-denim-border`, etc.), not raw hex.
- **All code, comments, and commit messages must be in English** — no Chinese identifiers, comments, or commit messages, regardless of what language the requirement was discussed in.
- **Animation: CSS first, framer-motion for state-driven only** — pure hover/visual interactions use plain CSS `:hover` + `transition`, not `framer-motion`. Reserve `framer-motion` for animations that must be orchestrated by React state or data changes (list enter/exit, value-driven transitions). Reaching for a JS animation library for static hover effects is over-engineering.

## Development Principles

- **Issue-driven:** confirm a GitHub issue exists before writing code for a new feature. Ask if one doesn't appear to exist.
- **Small PRs:** resolve one issue at a time, broken into the smallest deployable chunks.
- **Don't over-engineer:** don't extract components or abstractions with no current reuse value.
- **Don't commit on behalf of me:**: do not commit changes until i specify so
- **One-time migration scripts** live in `/scripts`, excluded from `tsconfig.json`'s type-check scope. Before writing to the database, calibrate the transform logic against a small set of known ground-truth rows already in the database — abort if calibration fails. Safe to delete after a successful run; not covered by the "core logic needs unit tests" constraint.
- **Verify third-party field semantics before writing adapters** — when integrating an external dataset or API, pull a small sample of real rows (at least one simple case and one edge case) and reverse-verify each field's meaning against known-correct values before writing any transform code. Semantics guessed wrong produce silent bugs rather than compile/runtime errors, making them more expensive to catch later.

## Constraints (apply to every task unless explicitly told otherwise)

1. Don't modify Audio Core logic (scheduler loop, ref-based state, metronome logic in `useAudioEngine.ts`) unless the task is explicitly scoped to it.
2. TypeScript strict mode; `any` is forbidden; all exported functions need complete Type/Interface definitions.
3. Core computation/data-processing logic ships with unit tests.
4. Check for memory leak risks — uncleared EventListeners, Timers, or (for audio) dangling `AudioBufferSourceNode`/scheduled-callback references.

## Known Test Environment Limitations

- jsdom does not implement a real Canvas 2D API, so VexFlow text-metrics calls in `fingerpickToVexFlow.test.ts` log warnings and return empty metrics. This doesn't currently invalidate those tests (they assert on data structures, not rendered positions). That a stave is actually drawn is checked in the Playwright smoke suite instead (`e2e/smoke/fingerpick.spec.ts`), which is the browser-based runner that gap asked for; a test that asserts on rendered positions still belongs there, not in Vitest.

**End-to-end** (`e2e/`, #259): Playwright, Chromium only. `smoke` is one short path per page, signed out, and is what CI runs; `account` needs `E2E_EMAIL` / `E2E_PASSWORD` and skips without them; `books` is local and by hand (`npm run test:e2e:books`), since it needs the Python service and minutes of OCR. Select by role and accessible name — where a component has no name, add an `aria-label` rather than a `data-testid`. See `e2e/README.md`.
