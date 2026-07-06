# Guitar Pal — Technical Project Brief

This document is a complete reference for an AI assistant working on this codebase. Read it before touching any file.

---

## Project Overview

**Guitar Pal** is a web-based guitar practice studio targeting beginner-to-intermediate self-taught guitarists. The core loop is: create exercises → assemble them into routines → run timed practice sessions → log the result. A strumming machine with real-time audio playback and a chord library are standalone tools alongside the core loop.

**Current state:** Active development. A Vitest suite (8 files) covers the strum engine (`useGuitarSampleLoader`, `useAudioEngine`), fingerpick rendering (`fingerpickToVexFlow`), and the chord library utilities (`chordVoicingToVexChords`, `chordSuffixes`, `chordSlug`, `musicalNotation`, `MusicalText`). UI components and Supabase-connected flows have no automated coverage. All features work. Practice logs are written but never displayed. The exercise log table exists but has no UI at all.

---

## Tech Stack

| Layer               | Technology                                 | Version |
| ------------------- | ------------------------------------------ | ------- |
| Framework           | Next.js (App Router)                       | 16.2.10 |
| UI library          | React                                      | 19.2.7  |
| Styling             | Tailwind CSS v4                            | 4.x     |
| Component library   | shadcn/ui (radix-nova style)               | 4.x     |
| Primitive UI        | Radix UI (via shadcn)                      | 1.x     |
| Icons               | lucide-react                               | 1.x     |
| Animations          | framer-motion                              | 12.x    |
| Chord diagrams      | vexchords                                  | 1.x     |
| Chord data source   | @tombatossals/chords-db                    | 0.5.x   |
| Toast notifications | sonner                                     | 2.x     |
| Auth + Database     | Supabase (`@supabase/ssr`)                 | 0.10.x  |
| Fonts               | Geist Sans + Geist Mono (next/font/google) | —       |
| Language            | TypeScript (strict mode)                   | 5.x     |
| Guitar sample data  | webaudiofontdata CDN (runtime fetch, no npm pkg) | GPL-3.0 |

A Vitest test suite covers selected modules (strum engine, fingerpick renderer, and chord library utilities); UI components and Supabase flows have no automated coverage. No ORM. `src/lib/chords.ts` uses `"use server"` and its functions are called by the chord page server components. All other DB calls happen client-side via the browser Supabase client.

---

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx               # Root layout: fonts, Toaster, html/body wrapper
│   ├── globals.css              # Tailwind v4 imports, CSS custom properties (denim palette + shadcn vars)
│   ├── page.tsx                 # Marketing home page (hero + feature grid)
│   ├── not-found.tsx            # 404 page
│   ├── icon.svg                 # Favicon
│   ├── (auth)/
│   │   └── auth/page.tsx        # Sign-in / sign-up page (tabs, email+password)
│   ├── (main)/
│   │   ├── layout.tsx           # Adds <NavBar /> above all main-area pages
│   │   ├── dashboard/page.tsx   # Server component: reads user, renders DashboardContent
│   │   ├── chords/
│   │   │   ├── page.tsx         # Landing: root-picker grid + "Browse All Chords" link
│   │   │   ├── all/page.tsx     # All chords; ?group=category toggles root-first / category-first
│   │   │   └── [rootSlug]/
│   │   │       ├── page.tsx     # Per-root: suffixes grouped by category, with desktop + mobile TOC
│   │   │       └── [suffixSlug]/page.tsx  # Chord detail: voicing grid, fret/note-name label toggle
│   │   └── strum/page.tsx       # Client component: full strumming machine page
│   └── session/
│       └── [routineId]/page.tsx # Client component: full practice session page
│
├── components/
│   ├── NavBar.tsx               # Sticky top nav: logo, NavLinks, user email, LogoutButton
│   ├── NavLinks.tsx             # Pill-style nav switcher for /chords and /strum
│   ├── LogoutButton.tsx         # Calls signOut(), then router.refresh()
│   ├── DashboardContent.tsx     # Client wrapper: fetches exercises, passes to ExerciseList + RoutineList
│   ├── ExerciseList.tsx         # Exercise CRUD: list, filter, add form, delete with routine warning
│   ├── RoutineList.tsx          # Routine CRUD: list, expand, edit dialog, start session
│   ├── MusicalText.tsx          # Renders ♭/♯ symbols inline; driven by parseMusicalText
│   ├── chords/
│   │   ├── BrowseGrid.tsx       # Renders BrowseSection[] as grouped heading + card-grid blocks
│   │   ├── ChordDetailView.tsx  # Voicing grid with fret/note-name label toggle (detail page)
│   │   ├── ChordDiagram.tsx     # vexchords ChordBox wrapper; SSR-safe dynamic import; compact + regular sizes
│   │   ├── ChordToc.tsx         # Desktop sidebar: piano-key (root-first) or thin-line hover-expand (category-first)
│   │   ├── ChordTocIndicator.tsx # Mobile/tablet: persistent right-edge scroll indicator, always visible
│   │   └── LazyChordDiagram.tsx # IntersectionObserver-gated ChordDiagram for browse grids (300 px rootMargin)
│   ├── strum/
│   │   ├── StepGrid.tsx         # Pure display: renders beat/cell grid with live highlight
│   │   ├── StepGridCard.tsx     # Card wrapper around StepGrid with pattern name + description
│   │   ├── CreatePatternModal.tsx # Dialog for creating/editing custom patterns
│   │   ├── useAudioEngine.ts    # Web Audio API scheduler, all playback logic
│   │   ├── useGuitarSampleLoader.ts # webaudiofontdata CDN preset fetching/parsing, multi-string strum scheduling
│   │   ├── useStrumPatterns.ts  # Custom pattern + favourites state, localStorage/Supabase sync
│   │   └── __tests__/
│   │       ├── useAudioEngine.test.ts        # _resolveStrumBuffer unit tests (10 tests)
│   │       └── useGuitarSampleLoader.test.ts # Preset parsing, scheduling, decay constants (49 active + 2 skipped)
│   └── ui/                      # shadcn primitives: button, card, dialog, input, label, select, switch, tabs, sonner
│
├── hooks/
│   └── useUser.ts               # Subscribes to Supabase auth state, returns { user, loading }
│
├── lib/
│   ├── supabase.ts              # createClient() — browser client via createBrowserClient
│   ├── supabase-server.ts       # createSupabaseServer() — server client via createServerClient + cookies()
│   ├── auth.ts                  # signUp, signIn, signOut, getUser (all call browser client)
│   ├── exercises.ts             # createExercise, getExercises, deleteExercise, getRoutineNamesForExercise, removeAllRoutineExercisesByExerciseId
│   ├── routines.ts              # createRoutine, getRoutines, getRoutineById, deleteRoutine, addExerciseToRoutine, removeExerciseFromRoutine, updateRoutineExerciseDuration, swapRoutineExerciseOrder, getRoutineExercises
│   ├── practiceLogs.ts          # createPracticeLog, getPracticeLogs (getPracticeLogs has no UI caller)
│   ├── exerciseLogs.ts          # createExerciseLog, getExerciseLogs (neither has a UI caller)
│   ├── chords.ts                # "use server" — getChord, getChordsByRoot, getAllChordsWithVoicings
│   ├── chordVoicingToVexChords.ts # ChordVoicing → VexChordDef adapter; barre detection; selectStandardVoicing
│   ├── chordSuffixes.ts         # ROOT_CHROMATIC_ORDER, CHORD_SUFFIX_CATEGORIES, EXCLUDED_SUFFIXES, groupSuffixes, sortRoots
│   ├── chordSlug.ts             # Bidirectional slug encoding: rootToSlug/slugToRoot, suffixToSlug/slugToSuffix
│   ├── chordBrowseSections.ts   # BrowseSection/Card/Subsection types; three section builders
│   ├── chordToc.ts              # tocSectionId, buildToc — shared anchor ID scheme for TOC and scroll-spy
│   ├── musicalNotation.ts       # parseMusicalText — pure display parser (not for slugs/metadata)
│   ├── strumPatterns.ts         # StepValue / Beat / TickMode types, StrumPattern interface, PRESET_STRUM_PATTERNS array
│   ├── constants.ts             # CATEGORY_LABELS and CATEGORY_COLORS records
│   └── utils.ts                 # shadcn cn() utility
│
├── types/
│   ├── database.ts              # CATEGORIES const array, Category type, Exercise, Routine, RoutineExercise, PracticeLog, ExerciseLog types
│   └── vexchords.d.ts           # Module declaration shim for vexchords (no official TS typings)
│
└── proxy.ts                     # Next.js middleware (Next.js 16 uses proxy.ts, not middleware.ts): auth routing guards
```

---

## Supabase Schema

Inferred from type definitions and query code. RLS policies are not visible from the codebase — assume standard user-scoped RLS (`auth.uid() = user_id`) on all user-owned tables.

### User-owned tables

**`exercises`**

```
id            uuid  PK
user_id       uuid  FK → auth.users
title         text
category      text  (one of CATEGORIES enum below)
description   text | null
target_bpm    int  | null   (exists in DB, never set or read by any UI)
stage         int          (exists in DB, never set or read by any UI)
created_at    timestamptz
```

**`routines`**

```
id            uuid  PK
user_id       uuid  FK → auth.users
title         text
created_at    timestamptz
```

**`routine_exercises`** (join table with ordering)

```
id                uuid  PK
routine_id        uuid  FK → routines
exercise_id       uuid  FK → exercises
duration_minutes  int
order_index       int
```

**`practice_logs`** (immutable, append-only)

```
id                uuid  PK
user_id           uuid  FK → auth.users
routine_id        uuid | null  FK → routines
routine_name      text         (denormalised — snapshot at log time)
duration_minutes  int  | null
rating            int  | null  (1–5)
notes             text | null
completed_at      timestamptz
```

**`exercise_logs`** (immutable, append-only — no UI uses this yet)

```
id                uuid  PK
user_id           uuid  FK → auth.users
exercise_id       uuid | null  FK → exercises
exercise_name     text         (denormalised snapshot)
duration_minutes  int  | null
reps              int  | null
notes             text | null
logged_at         timestamptz
```

**`user_strum_patterns`**

```
user_id     uuid  FK → auth.users
pattern_id  text  (client-generated UUID)
name        text
beats       jsonb (Beat[][] — array of Beat arrays)
description text
```

**`user_favourite_patterns`**

```
user_id     uuid  FK → auth.users
pattern_id  text  (matches pattern_id in user_strum_patterns OR a preset id)
```

### Shared / read-only tables (no user_id, presumably public)

**`chords`**

```
id      uuid  PK
root    text  (e.g. "C", "F#")
suffix  text  (e.g. "major", "minor", "7", "maj7")
```

**`chord_voicings`**

```
id          uuid  PK
chord_id    uuid  FK → chords   (inferred from the select join)
label       text
start_fret  int
barre_fret  int | null
capo        bool | null
frets       jsonb  (array of fret numbers per string, -1 = muted)
fingers     jsonb  (array of finger numbers per string)
```

---

## Auth Architecture

- **Browser client** (`createClient()` in `src/lib/supabase.ts`): used in all client components and all lib functions. Created fresh on each call — `createBrowserClient` returns a singleton internally.
- **Server client** (`createSupabaseServer()` in `src/lib/supabase-server.ts`): used only in server components (`dashboard/page.tsx`, `chords/page.tsx`, `NavBar.tsx`). Reads and writes cookies for session management.
- **`useUser` hook**: subscribes to `onAuthStateChange` in addition to an initial `getUser()` call, so the client reacts to sign-in/sign-out without a page reload.
- **Middleware (`src/proxy.ts`):** In Next.js 16, `proxy.ts` is the middleware entry point. It guards `/dashboard` and `/session/:path*` against unauthenticated access, redirecting to `/`. See the Routing and Auth Guard section for full rules.

---

## Feature Implementation Details

### Strumming Machine (`/strum`)

**Files:** `src/app/(main)/strum/page.tsx`, `src/components/strum/*`

**Layout:** Three-column on desktop (library sidebar left | StepGridCard centre | controls right). On mobile: hidden library (slide-in overlay), StepGridCard, controls stacked below. Responsive breakpoints: `lg` for sidebar always-visible, `md` for two-column controls layout.

**Pattern data model** (`src/lib/strumPatterns.ts`):

```ts
type StepValue = "D" | "U" | "X" | "" | "DG" | "UG" | "D3" | "U3";
type Beat = StepValue[]; // length 1–4
interface StrumPattern {
	id;
	name;
	beats: Beat[];
	description;
}
```

StepValue semantics:

- `D` — down strum (audible)
- `U` — up strum (audible)
- `X` — muted strum (audible, distinct noise)
- `DG` / `UG` — ghost (metronome ticks, strum engine silent)
- `D3` / `U3` — triplet (same sound as D/U, used when beat.length === 3)
- `""` — rest (metronome ticks only)

**Audio engine** (`src/components/strum/useAudioEngine.ts`, `src/components/strum/useGuitarSampleLoader.ts`):

- Uses the Web Audio API directly — no library.
- Scheduler pattern: `setTimeout`-based lookahead loop (100 ms lookahead window, 25 ms reschedule interval).
- All mutable state that the scheduler reads lives in `useRef` (not `useState`) to avoid stale closures. The matching `useState` values are kept for React renders only. Refs: `bpmRef`, `beatsRef`, `tickModeRef`, `strumEnabledRef`, `strumGainRef`, `metronomeEnabledRef`, `metronomeGainRef`, `accentEnabledRef`, `playOnceRef`.
- **Do not read ref.current values inside React render logic.** Only refs are safe to read inside the scheduler closure.
- **Strum sounds use real guitar samples** fetched at runtime from the webaudiofontdata CDN (`https://surikov.github.io/webaudiofontdata/sound/`). All sample logic lives in `useGuitarSampleLoader.ts`:
  - Two GM presets: `0250_SoundBlasterOld_sf2` (acoustic steel guitar — used for `D`/`D3` down-strum and `U`/`U3` up-strum) and `0280_SoundBlasterOld_sf2` (muted electric guitar — used for `X`).
  - Fixed C major open chord voicing: MIDI pitches [48 C3, 52 E3, 55 G3, 60 C4, 64 E4] (exported as `STRUM_PITCHES`). Low E string is not played.
  - `preloadStrumPresets(ctx)` — async, called once on playback start. Fetches and parses both preset JS files (unquoted-key JS object format, evaluated via `new Function()`), then decodes all zones used by `STRUM_PITCHES` into `AudioBuffer`s. Results are cached in module-level `Map`s for synchronous scheduler access.
  - `triggerStrum(type, ctx, target, when, noteDuration)` — synchronous. Schedules one `AudioBufferSourceNode` per string (5 total) with 10 ms per-string stagger and 0.9× volume taper per string. Down strum: low→high pitch order; up strum: high→low. Playback rate per note: `2^((100×midiPitch − baseDetune) / 1200)` where `baseDetune = originalPitch − 100×coarseTune − fineTune`.
  - Decay envelope per note: `gainNode.gain.setTargetAtTime(0, when, τ)` where `τ = max(noteDuration × DECAY_TIME_CONSTANT_RATIO, MIN_DECAY_TC_S)`. Constants (from source): `DECAY_TIME_CONSTANT_RATIO = 0.8`, `MIN_DECAY_TC_S = 0.03 s`, `SOURCE_STOP_BUFFER_S = 0.05 s`. Muted strums additionally cap `noteDuration` at `MUTED_MAX_DURATION_S = 0.08 s`.
  - `cancelStrums()` — stops all tracked `AudioBufferSourceNode`s immediately. Called on manual stop and component unmount.
- Each scheduler tick creates a per-strum `GainNode` (gain = `strumGainRef.current`) that connects `triggerStrum`'s output to `ctx.destination`.
- `DG`, `UG`, and `""` step values produce no strum sound (scheduler calls are gated by `STEP_TO_SOUND` mapping in `useAudioEngine.ts`).
- Metronome: `OscillatorNode`, 1200 Hz accented / 800 Hz normal, 50 ms duration.
- `setStrumEnabled` and `setMetronomeEnabled` stop and restart playback so the ref update propagates immediately.
- `sixteenth` tick mode with a 2-cell beat interleaves real cells with empty subdivisions (alternating via `nextPlatEmptyCellRef`).
- BPM range: 40–220. Tap tempo uses up to 8 recent taps, resets after 2 seconds of inactivity.

**Custom pattern sync** (`src/components/strum/useStrumPatterns.ts`):

- Logged-out: patterns and favourites stored in `localStorage` under keys `customStrumPatterns` and `favouritePatternIds`.
- Logged-in: stored in `user_strum_patterns` and `user_favourite_patterns` Supabase tables.
- On login: localStorage patterns are merged into Supabase (deduplication by `pattern_id`). After merge, localStorage entries are cleared. A Sonner toast is shown if any data was migrated.
- The selected pattern is invalidated (set to `null`) if it is a custom pattern and gets deleted, or if the user logs out (via a `useEffect` watching `customPatterns`).
- The last selected pattern ID is persisted to localStorage as `lastStrumPattern` and restored on mount (presets only — custom patterns are not restored this way).

**Pattern creator** (`src/components/strum/CreatePatternModal.tsx`):

- Editing cycles cells through `["", "D", "U", "X"]` only. Ghost (`DG`/`UG`) and triplet (`D3`/`U3`) values can exist in preset/saved data and display correctly in StepGrid, but cannot be set via the creator UI — clicking a ghost or triplet cell resets it to `""`.
- Each beat can have 2–4 cells. Beats always have exactly 4 columns displayed (2-cell beats are padded to 4 display slots with ghost cells in StepGrid).
- Unauthenticated users who try to save are shown a choice: save locally or go sign in.

**StepGrid display** (`src/components/strum/StepGrid.tsx`):

- Receives `beats: Beat[]` and `activeCell: { beatIdx, cellIdx } | null`.
- 2-cell beats are padded to 4 display columns using ghost values; the `getPaddedCellIdx` function maps the audio engine's `cellIdx` to the padded display index.
- Beat labels: 1-cell → `["1", "", "+", ""]`; 2-cell → `["1", "", "+", ""]`; 3-cell → `["tri", "p", "let"]`; 4-cell → `["1", "e", "+", "a"]`.
- `size="sm"` variant used in library sidebar previews (smaller icons, no labels).

---

### Chord Library (`/chords`)

**Routes:**

| Route | File | Description |
| ----- | ---- | ----------- |
| `/chords` | `chords/page.tsx` | Landing: chromatic root-picker buttons + "Browse All Chords →" link |
| `/chords/all` | `chords/all/page.tsx` | All chords; `?group=category` toggles root-first / category-first grouping |
| `/chords/[rootSlug]` | `chords/[rootSlug]/page.tsx` | Per-root: all suffixes grouped by category; desktop + mobile TOC |
| `/chords/[rootSlug]/[suffixSlug]` | `chords/[rootSlug]/[suffixSlug]/page.tsx` | Chord detail: voicing grid with fret/note-name label toggle |

All four routes are server components using `createSupabaseServer()`. The `/chords/all` and `/chords/[rootSlug]` pages pass chord data to client-side rendering components (`BrowseGrid`, `ChordToc`, `ChordTocIndicator`) via props.

**Data layer:**

`src/lib/chords.ts` (`"use server"`) exposes three server actions:
- `getAllChordsWithVoicings()` — full table scan ordered by root then suffix; used by `/chords/all`.
- `getChordsByRoot(root)` — filters by root; used by `/chords/[rootSlug]`.
- `getChord(root, suffix)` — single chord with all voicings; used by `/chords/[rootSlug]/[suffixSlug]`.

The `chords` table covers all 12 chromatic roots (C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B). Data was imported from `@tombatossals/chords-db`. C# and F# voicings were backfilled post-import using `scripts/import-missing-roots.ts`, which reads the `Csharp`/`Fsharp` JSON keys from the package, calibrates `start_fret` relative encoding against a known-good C major reference position, and upserts via the service-role key.

**Adapter / utility layer:**

- **`src/lib/chordVoicingToVexChords.ts`** — Pure adapter (no DOM/React). Converts a `ChordVoicing` DB row (6-char `frets`/`fingers` strings, relative `start_fret`, optional `barre_fret`/`capo`) into a `VexChordDef` for the vexchords `ChordBox`. Barre detection: `capo=true` → full 6-string barre; otherwise finds all non-muted strings sharing the `barre_fret` digit and computes `fromString`/`toString` span. Also exports `selectStandardVoicing` (returns the "Standard"-labelled voicing, or the one with the lowest `start_fret` as fallback).

- **`src/lib/chordSuffixes.ts`** — Root ordering and suffix taxonomy.
  - `ROOT_CHROMATIC_ORDER`: `["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]` — single source of truth for display order everywhere.
  - `CHORD_SUFFIX_CATEGORIES`: 7 named categories (Major, Minor, Dominant 7th, Suspended, Diminished, Augmented, Power Chord), each with an ordered `suffixes` list. Slash chords are a separate dimension, detected by `isSlashChord(suffix)` (`suffix.includes("/")`).
  - `EXCLUDED_SUFFIXES`: `["7sg"]` — three mislabelled C7 voicings in the DB; excluded at the UI layer only. See Known Issues.
  - `groupSuffixes(available)` — intersects an available-suffix array with the taxonomy in taxonomy order, filtering out excluded and slash suffixes.
  - `getSlashSuffixes(available)` — returns slash chords from available, minus excluded.
  - `sortRoots(roots)` — sorts an array of root strings into chromatic pitch order.

- **`src/lib/chordSlug.ts`** — Bidirectional URL-safe encoding. `#` → `-sharp-` (trailing `-` stripped); `/` in slash-chord suffixes → `-over-` with the bass note re-encoded via `rootToSlug` (e.g. `m9/A` → `m9-over-a`, bare `/E` → `over-e`). Decoding is the exact inverse; handles both the leading-`over-` and mid-`-over-` cases.

- **`src/lib/chordBrowseSections.ts`** — Pure data-shaping layer. Exports `BrowseCard`, `BrowseSubsection`, `BrowseSection` types and three builders:
  - `buildRootSections(chords, buildHref?)` — for `/chords/[rootSlug]`; flat sections, one per category.
  - `buildAllChordsRootFirst(allChords, buildHref?)` — for `/chords/all` root-first; one section per root, each with category subsections.
  - `buildAllChordsCategories(allChords, buildHref?)` — for `/chords/all` category-first; one section per category, each with root subsections.

- **`src/lib/chordToc.ts`** — Shared anchor ID scheme. `tocSectionId(label)` lowercases, replaces `#` with `-sharp`, collapses spaces to hyphens, strips other non-alphanumerics. `buildToc(sections)` returns level-1 `TocEntry[]` (one per top-level section) consumed by both `ChordToc` and `ChordTocIndicator`.

- **`src/lib/musicalNotation.ts`** + **`src/components/MusicalText.tsx`** — `parseMusicalText(text)` splits a string into plain-text and `♭`/`♯` symbol segments (replacing `b` → ♭ and `#` → ♯). `MusicalText` renders those segments as inline JSX. Display-only — not used for URL slugs or `<title>`/`<meta>` content.

**Navigation components:**

- **`ChordToc.tsx`** (desktop, `hidden lg:flex`, fixed right edge) — Derives mode by checking whether `sections[0].label` is in `ROOT_CHROMATIC_ORDER`:
  - *Root-first*: piano-key sidebar (`w-28`). On group hover, white keys expand to full `w-28` and black keys to `w-18`; both grow leftward within the fixed container (`items-end`). Labels fade in on hover. Active key: `bg-denim/70`.
  - *Category-first*: thin-line Notion-style outline. A coloured line per entry shrinks and fades on group hover as a text label slides in from the right. Active entry: `text-denim`.

- **`ChordTocIndicator.tsx`** (mobile/tablet, `lg:hidden`, fixed right edge, always visible) — One `h-7` button per top-level section; nav sizes to content height and is centred vertically via `top-1/2 -translate-y-1/2`. Text labels horizontal; active entry gets a larger font and `text-denim`. `IntersectionObserver` scroll-spy with `rootMargin: "0px 0px -70% 0px"`. Clicking smooth-scrolls to the target section. Replaces the earlier floating-button + Dialog (`ChordTocMobile`, now deleted).

**Rendering components:**

- **`ChordDiagram.tsx`** — Client component. Dynamically imports `vexchords` (`import("vexchords").then(({ ChordBox }) => ...)`) so it and its SVG.js dependency never enter the SSR bundle. Two size presets: `REGULAR` (160 × 200 px, `showTuning: true`) for the detail page; `COMPACT` (100 × 120 px) for browse grids. Each render clears the container div then calls `box.draw(def)`.

- **`LazyChordDiagram.tsx`** — `IntersectionObserver`-gated mount guard (300 px `rootMargin`) for browse grids. Renders a fixed-size placeholder skeleton until the element enters the viewport (`COMPACT_W=126, COMPACT_H=168 px`), then mounts `ChordDiagram`. Accepts `href` (wraps in `<Link>`) or `onClick` callback. Shows a hover tooltip ("Click to see all voicings").

- **`BrowseGrid.tsx`** — Renders a `BrowseSection[]` as stacked heading + card-grid blocks, handling both flat (`cards` array) and nested (`subsections`) section shapes.

- **`ChordDetailView.tsx`** — Voicing grid for the detail page. Shows all voicings for a single chord using full-size `ChordDiagram` components, with a fret/note-name label toggle.

**Attribution:** `@tombatossals/chords-db` (MIT) and `vexchords` are in `package.json`. `THIRD_PARTY_LICENSES.md` at the repo root and an in-app footer credit are not yet present — see Backlog.

---

### Dashboard (`/dashboard`)

**Files:** `src/app/(main)/dashboard/page.tsx`, `src/components/DashboardContent.tsx`, `src/components/ExerciseList.tsx`, `src/components/RoutineList.tsx`

`dashboard/page.tsx` is a server component that reads the user via `createSupabaseServer()`. It renders `<DashboardContent />` which is a client wrapper.

`DashboardContent` fetches all exercises on mount via `getExercises()` and passes them down to both `ExerciseList` and `RoutineList`. It exposes `refreshExercises()` (full refetch) and `addExerciseOptimistic()` (immediate append) callbacks.

**ExerciseList:**

- Add form: category (Select) + name (Input) + optional description. Submits on Enter or button click.
- Category filter bar appears once exercises exist. Filter state clears automatically if the active category disappears.
- Deletion: checks `getRoutineNamesForExercise()` first. If non-empty, shows an inline confirmation banner listing affected routines. Confirmation deletes via `removeAllRoutineExercisesByExerciseId` then `deleteExercise`.
- Uses `framer-motion` `AnimatePresence` + `layout` for list item enter/exit animations.

**RoutineList:**

- Routines fetch on mount. `routineExercisesMap` is a `Record<string, RoutineExerciseWithExercise[]>` populated lazily when a routine is expanded or its edit dialog opened.
- Expand/collapse is single-selection (`expandedId` string or null).
- Edit dialog: add exercise (category → exercise → duration), reorder (swap adjacent via `swapRoutineExerciseOrder`), remove, change duration (onBlur, only if changed and >0).
- `swapRoutineExerciseOrder` does two parallel fetches then two parallel updates — not atomic (no database transaction).
- When an exercise is deleted from `ExerciseList`, `RoutineList` clears its `routineExercisesMap` and collapses all panels (watches `exercises.length`).

---

### Practice Session (`/session/[routineId]`)

**File:** `src/app/session/[routineId]/page.tsx`

State machine: `"idle" → "running" → "paused" → "completed" → "all_done"`.

- `idle`: timer loaded, not started.
- `running`: countdown active.
- `paused`: countdown frozen.
- `completed`: timer hit zero, awaiting user to advance or repeat.
- `all_done`: last exercise finished, show completion screen.

Timer logic: a `useEffect` dependent on `[status, secondsLeft, nextExercise]` sets a 1-second interval when `status === "running"`. Each tick decrements `secondsLeft` and increments `totalSecondsElapsed`. When `secondsLeft <= 1`, transitions to `completed` or `all_done`.

`handleExtendTime` / `handleReduceTime` add/subtract 30s in-place.

Completion screen: requires a 1–5 star `rating` to enable Save. Notes are optional. On save: calls `createPracticeLog()` then `router.push("/dashboard")`. "Skip & Exit" navigates without saving. "Repeat" resets all local state to `idle` at exercise 0.

Progress bar at top: `(currentExerciseIndex / routineExercises.length) * 100`. Animates via `framer-motion`.

Low-time indicator: timer text turns `text-amber-500` when `secondsLeft <= 10` and `status === "running"`.

---

## Routing and Auth Guard

**`src/proxy.ts` is the Next.js 16 middleware file.** In Next.js 16, the middleware entry point is named `proxy.ts` rather than `middleware.ts`. It runs at the edge on every matched request.

Matcher: `["/dashboard/:path*", "/session/:path*", "/", "/auth/:path*"]`

Routing rules:

- Unauthenticated + not `/auth` + not `/` → redirect to `/`.
- Authenticated + `/auth` → redirect to `/dashboard`.
- Authenticated + `/` → redirect to `/dashboard`. This means logged-in users never see the marketing home page — they are immediately sent to the dashboard.

Auth redirect on `/auth` page: after sign-in/sign-up, redirects to `?redirect` param or defaults to `/dashboard`.

---

## Key Conventions

### Two Supabase clients — never mix them

| Client                   | File                         | Use in                               |
| ------------------------ | ---------------------------- | ------------------------------------ |
| `createClient()`         | `src/lib/supabase.ts`        | Client components, all lib functions |
| `createSupabaseServer()` | `src/lib/supabase-server.ts` | Server components only               |

Using `createSupabaseServer()` in a client component will throw at runtime because `cookies()` from `next/headers` is not available client-side.

### Data layer pattern

All lib functions in `src/lib/`:

- Use `createClient()` (browser Supabase client).
- **Throw** on Supabase error (`if (error) throw new Error(error.message)`). No null-returning error paths.
- Do not filter by `user_id` in queries — RLS handles scoping. Only inserts pass `user_id` explicitly.
- Return typed values matching `src/types/database.ts`.

### Component pattern

- Feature components in `src/components/` are `"use client"` and manage their own data fetching.
- UI primitives in `src/components/ui/` are shadcn-generated — do not hand-edit them unless necessary; use shadcn CLI to update.
- `DashboardContent` is the exception: it's a thin client wrapper that lifts exercise state shared between `ExerciseList` and `RoutineList`.

### CATEGORIES

`CATEGORIES` in `src/types/database.ts` is the single source of truth for exercise categories:

```ts
"chord" |
	"chord_change" |
	"picking" |
	"scale" |
	"strumming" |
	"fingering" |
	"ear_training" |
	"arpeggio" |
	"theory" |
	"song";
```

Display labels: `CATEGORY_LABELS` in `src/lib/constants.ts`.
Colour classes: `CATEGORY_COLORS` in `src/lib/constants.ts` (Tailwind inline bg + text classes).

### Denim colour palette

The brand colour is "denim blue". Use Tailwind classes, not raw hex:

| Class                     | CSS var          | Use                                |
| ------------------------- | ---------------- | ---------------------------------- |
| `text-denim` / `bg-denim` | `--denim`        | Active state, primary interactive  |
| `bg-denim-tint`           | `--denim-tint`   | Light background tint              |
| `border-denim-border`     | `--denim-border` | Borders on denim-tinted containers |
| `text-denim-dark`         | `--denim-dark`   | Deeper hover state                 |
| `text-denim-light`        | `--denim-light`  | Muted / ring                       |

Dark mode variants of these vars are defined in `globals.css` under `.dark`.

### Path alias

`@/` maps to `src/`. Defined in `tsconfig.json`.

### Custom breakpoint

`nav:` breakpoint at `50rem` (defined in `@theme` in `globals.css`). Used in `NavLinks` to show/hide text labels next to icons.

### Animations

`framer-motion` is used for list enter/exit (`AnimatePresence` + `motion.div`) and height transitions (collapsible panels use `initial={{ height: 0 }}` / `animate={{ height: "auto" }}`). The session progress bar and exercise transition also use motion.

### Toasts

`sonner` (`<Toaster />` in root layout). Call `toast("message")` from any client component. Used in `useStrumPatterns` for the post-login merge notification.

---

## Critical Known Issues / Gotchas

1. **Practice history has no UI.** `getPracticeLogs()` exists in `practiceLogs.ts` and data is written after each session, but no component ever calls it or renders the history.

2. **Exercise logs are fully disconnected.** `exerciseLogs.ts` defines `createExerciseLog` and `getExerciseLogs`. Neither is imported anywhere in the UI.

3. **`target_bpm` and `stage` on exercises are orphaned.** Both fields exist in the `Exercise` type and presumably in the database, but no form sets them and no UI displays them.

4. **`swapRoutineExerciseOrder` is not atomic.** It does two fetches and two updates without a transaction. A network failure mid-swap leaves `order_index` in an inconsistent state. Consider a Supabase RPC function if this becomes a problem.

5. **No optimistic updates on routine editing.** Duration changes and exercise additions in the edit dialog wait for the network round-trip before updating UI (except removes, which update state immediately). The UX is acceptable but could be improved.

6. **`ChordsView.tsx`, `AllChordsGrid.tsx`, and `RootOverviewGrid.tsx` are orphaned dead code.** These three files in `src/components/chords/` are a leftover from an earlier in-place native-UI prototype that predates the current App Router route structure. None are imported by any page or active component. They can be deleted.

7. **`7sg` suffix data is mislabelled.** Three rows in the `chords` table under root `C` with suffix `7sg` are actually mislabelled C7 voicings. They are silently excluded at the UI layer via `EXCLUDED_SUFFIXES` in `chordSuffixes.ts` but remain in the database. A one-off delete or correction is the clean fix.

8. **jsdom has no real Canvas / text-measurement implementation.** VexFlow internally calls `Canvas.measureText()` to compute notation layout. Under jsdom, `measureText()` returns zero widths for all strings, so `fingerpickToVexFlow` tests cannot meaningfully assert pixel-level layout (note x-positions, stave widths). Tests are therefore written against the output object graph (note types, beam groups, connectors) rather than rendered geometry. Tracked as a separate GitHub issue.

---

## Backlog / Implied Future Work

These are inferred from scaffolded-but-unused code and obvious gaps:

- **Practice history page** — render `getPracticeLogs()` results, ideally with calendar heatmap or weekly summary.
- **Exercise log UI** — wire up `createExerciseLog` and `getExerciseLogs`; perhaps a per-exercise progress view.
- **Third-party attribution** — add `THIRD_PARTY_LICENSES.md` at the repo root and an in-app footer credit linking to the `tombatossals/chords-db` and `vexchords` GitHub repos. Both are currently declared in `package.json` but have no in-app attribution.
- **Atomic reordering** — replace the two-update `swapRoutineExerciseOrder` with a Supabase RPC.
