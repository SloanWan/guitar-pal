# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
npm test         # Run Vitest test suite
```

A pre-commit hook (`.husky/pre-commit`) runs `tsc --noEmit`, `npm run lint`, and `npm test` before every commit — fix all three before pushing.

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

**Auth flow:** `/auth` page handles sign-in/sign-up via `src/lib/auth.ts`. `src/proxy.ts` is the Next.js 16 middleware entry point (named `proxy.ts`, not `middleware.ts`) and guards `/dashboard/:path*` and `/session/:path*` against unauthenticated access. Authenticated users are redirected away from `/auth` and `/` to `/dashboard`.

**Two Supabase clients:**

- `src/lib/supabase.ts` — `createClient()` via `createBrowserClient`, used in client components and all lib query functions
- `src/lib/supabase-server.ts` — `createSupabaseServer()` via `createServerClient` + `cookies()`, used only in server components (e.g. `dashboard/page.tsx`, `chords/page.tsx`)

Never mix the two clients — `createSupabaseServer()` throws at runtime in client components.

Env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Data layer:** `src/lib/` contains thin Supabase query functions — no ORM, no server actions (except an unused one in `chords.ts`). All DB calls happen client-side. Lib functions throw on Supabase error rather than returning null. Tables:

- `exercises`, `routines`, `routine_exercises` (join table with `order_index` and `duration_minutes`)
- `practice_logs` — immutable records written at end of a session
- `exercise_logs` — per-exercise records (currently unused by any UI)
- `user_strum_patterns`, `user_favourite_patterns` — custom strum pattern storage
- `chords`, `chord_voicings` — shared/read-only reference data

Types defined in `src/types/database.ts`.

**Strumming machine audio engine** (`src/components/strum/`):

- `useAudioEngine.ts` — setTimeout-based lookahead scheduler (100 ms window, 25 ms reschedule). All scheduler-read state lives in `useRef`, never `useState`, to avoid stale closures and re-render-triggered timing drift. Do not read `ref.current` values inside React render logic.
- `useGuitarSampleLoader.ts` — fetches and parses WebAudioFont preset data from the pinned CDN (`surikov.github.io/webaudiofontdata`). Presets are JS object literals, not strict JSON — parsed via sandboxed `new Function()` evaluation, not `JSON.parse` or a hand-rolled tokenizer (this was tried and repeatedly broke on real CDN content — do not reintroduce a custom parser). Exposes `triggerStrum(type, ctx, target, when, noteDuration)`, which directly schedules one `AudioBufferSourceNode` per string (5 strings, 10 ms stagger, 0.9× volume taper) using the Web Audio API with a fixed C-major voicing (MIDI [48, 52, 55, 60, 64]). The `WebAudioFontPlayer` class is not used. Down strum: low→high pitch order; up strum: high→low. Exposes `preloadStrumPresets(ctx)` (call once on playback start) and `cancelStrums()` (call on stop and unmount).
- Note duration/decay must scale with the current BPM/beat interval (`noteDuration = secondsPerCell`) — a fixed duration causes audible overlap between consecutive strums at any tempo.

**Fingerpicking feature** (`src/lib/fingerpickTypes.ts`, `src/lib/fingerpickToVexFlow.ts`, `src/components/fingerpick/`):

- Data model in `fingerpickTypes.ts`: `FingerpickPattern` → `Measure[]` → `BeatSlot[]`. Each `BeatSlot` holds 6 `StringFret` entries (fret, technique, tied, muted flags) and a `Duration`. `Technique` covers hammer-on, pull-off, slide-up, slide-down.
- `fingerpickToVexFlow.ts` converts a `Measure` into VexFlow `TabNote`, `GhostNote`, `TabTie`, `TabSlide`, and `Beam` objects for stave rendering.
- `TabStaveRow.tsx` renders a row of tab staves using those VexFlow objects.

**Exercise categories** are a fixed `as const` array exported as `CATEGORIES` from `src/types/database.ts`: `"chord" | "chord_change" | "picking" | "scale" | "strumming" | "fingering" | "ear_training" | "arpeggio" | "theory" | "song"`.

**Session flow:** `/session/[routineId]` is a client component with a local timer state machine (`idle → running → paused → completed → all_done`). On `all_done`, it collects rating + notes and calls `createPracticeLog()`, then redirects to `/dashboard`.

**Component pattern:** Feature components (e.g. `ExerciseList`, `RoutineList`) live in `src/components/` and are marked `"use client"`. They handle their own data fetching and local state. UI primitives from shadcn live in `src/components/ui/` — don't hand-edit these unless necessary.

## Conventions

- Ghost cells (`"DG"`/`"UG"`) belong exclusively to the UI presentation layer — never let them leak into audio engine data structures.
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

- jsdom does not implement a real Canvas 2D API, so VexFlow text-metrics calls in `fingerpickToVexFlow.test.ts` log warnings and return empty metrics. This doesn't currently invalidate those tests (they assert on data structures, not rendered positions), but any future layout/positioning test would need a real Canvas implementation or a browser-based test runner. Tracked separately in GitHub issues.
