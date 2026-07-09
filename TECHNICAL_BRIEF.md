# Guitar Pal — Technical Project Brief

This document is a complete reference for an AI assistant working on this codebase. Read it before touching any file.

---

## Project Overview

**Guitar Pal** is a web-based guitar practice studio targeting beginner-to-intermediate self-taught guitarists. The core loop is: create exercises → assemble them into routines → run timed practice sessions → log the result. A strumming machine with real-time audio playback and a chord library are standalone tools alongside the core loop.

**Current state:** Active development. A Vitest suite (11 files) covers the strum engine (`useGuitarSampleLoader`, `useAudioEngine`, `fingerpickPresets`), fingerpick rendering (`fingerpickToVexFlow`), the fingerpick scheduler (`fingerpickScheduler`), and the chord library utilities (`chordVoicingToVexChords`, `chordVoicingToMidi`, `chordSuffixes`, `chordSlug`, `musicalNotation`, `MusicalText`). UI components and Supabase-connected flows have no automated coverage. All features work. Practice logs are written but never displayed. The exercise log table exists but has no UI at all.

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
│   │   │   ├── layout.tsx       # Chord library shell: wraps children + attribution footer (vexchords, tombatossals, WebAudioFont)
│   │   │   ├── page.tsx         # Landing: root-picker grid + "Browse All Chords" link
│   │   │   ├── all/page.tsx     # All chords; ?group=category toggles root-first / category-first
│   │   │   └── [rootSlug]/
│   │   │       ├── page.tsx     # Per-root: suffixes grouped by category, with desktop + mobile TOC
│   │   │       └── [suffixSlug]/page.tsx  # Chord detail: voicing grid, fret/note-name label toggle
│   │   ├── strum/page.tsx       # Client component: full strumming machine page
│   │   └── fingerpick/
│   │       └── page.tsx         # Client component: TAB viewer with pattern library and controls scaffold
│   ├── dev/
│   │   ├── audio-diagnostic/page.tsx      # Throwaway: multi-preset pitch audition tool
│   │   ├── muted-preset-audition/page.tsx # Throwaway: compares muted guitar presets
│   │   └── strum-preset-audition/page.tsx # Throwaway: compares strum guitar presets
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
│   ├── __tests__/
│   │   └── MusicalText.test.tsx # 6 tests: parseMusicalText symbol rendering
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
│   │   ├── BpmSlider.tsx        # Custom div-based BPM slider with genre tick marks and segment hover tooltips
│   │   ├── useGuitarSampleLoader.ts # webaudiofontdata CDN preset fetching/parsing, multi-string strum scheduling
│   │   ├── useStrumPatterns.ts  # Custom pattern + favourites state, localStorage/Supabase sync
│   │   └── __tests__/
│   │       ├── useAudioEngine.test.ts        # _resolveStrumBuffer unit tests (10 tests)
│   │       ├── useGuitarSampleLoader.test.ts # Preset parsing, scheduling, decay constants, triggerChordPreview (50 active + 2 skipped)
│   │       └── fingerpickPresets.test.ts     # getBufferForMidi, findZoneForMidi, fingerpick cache helpers (16 active + 2 skipped)
│   ├── fingerpick/
│   │   ├── TabStaveRow.tsx      # VexFlow TAB renderer; one row of measures per SVG context; ResizeObserver-driven
│   │   ├── useFingerpickAudioEngine.ts # Self-contained playback hook; lifecycle play/pause/resume/stop; BPM-seek; per-string voice stealing
│   │   └── __tests__/
│   │       └── fingerpickToVexFlow.test.ts  # 23 tests: duration mapping, note types, technique connectors, beam grouping
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
│   ├── chordVoicingToVexChords.ts # ChordVoicing → VexChordDef adapter; barre detection; selectStandardVoicing; exports decodeVoicingStrings
│   ├── chordVoicingToMidi.ts    # ChordVoicing → ChordMidiNote[]; uses decodeVoicingStrings; exports GUITAR_OPEN_MIDI, chordVoicingToMidi
│   ├── chordSuffixes.ts         # ROOT_CHROMATIC_ORDER, CHORD_SUFFIX_CATEGORIES, EXCLUDED_SUFFIXES, groupSuffixes, sortRoots
│   ├── chordSlug.ts             # Bidirectional slug encoding: rootToSlug/slugToRoot, suffixToSlug/slugToSuffix
│   ├── chordBrowseSections.ts   # BrowseSection/Card/Subsection types; three section builders
│   ├── chordToc.ts              # tocSectionId, buildToc — shared anchor ID scheme for TOC and scroll-spy
│   ├── musicalNotation.ts       # parseMusicalText — pure display parser (not for slugs/metadata)
│   ├── strumPatterns.ts         # StepValue / Beat / TickMode types, StrumPattern interface, PRESET_STRUM_PATTERNS array
│   ├── fingerpickTypes.ts       # FingerpickPattern / Measure / BeatSlot / StringFret / Technique / Duration types
│   ├── fingerpickToVexFlow.ts   # Pure adapter: Measure → VexFlowRenderData (TabNote / GhostNote / TabTie / TabSlide arrays)
│   ├── constants.ts             # CATEGORY_LABELS and CATEGORY_COLORS records
│   ├── utils.ts                 # shadcn cn() utility
│   └── __tests__/               # chordSlug, chordSuffixes, chordVoicingToMidi, chordVoicingToVexChords, fingerpickScheduler, musicalNotation
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
  - Two GM presets: `0250_LK_AcousticSteel_SF2_file` (LK Acoustic Steel — used for `D`/`D3` down-strum and `U`/`U3` up-strum) and `0280_Chaos_sf2_file` (Chaos muted guitar — used for `X`). Both presets match the sample library source used by the fingerpick engine for cross-page audio consistency.
  - Fixed C major open chord voicing: MIDI pitches [48 C3, 52 E3, 55 G3, 60 C4, 64 E4] (exported as `STRUM_PITCHES`). Low E string is not played.
  - `preloadStrumPresets(ctx)` — async, called once on playback start. Fetches and parses both preset JS files (unquoted-key JS object format, evaluated via `new Function()`), then decodes all zones used by `STRUM_PITCHES` into `AudioBuffer`s. Results are cached in module-level `Map`s for synchronous scheduler access.
  - `triggerStrum(type, ctx, target, when, noteDuration)` — synchronous. Schedules one `AudioBufferSourceNode` per string (5 total) with 10 ms per-string stagger and 0.9× volume taper per string. Down strum: low→high pitch order; up strum: high→low. Playback rate per note: `2^((100×midiPitch − baseDetune) / 1200)` where `baseDetune = originalPitch − 100×coarseTune − fineTune`.
  - Decay envelope per note: `gainNode.gain.setTargetAtTime(0, when, τ)` where `τ = max(noteDuration × DECAY_TIME_CONSTANT_RATIO, MIN_DECAY_TC_S)`. Constants (from source): `DECAY_TIME_CONSTANT_RATIO = 1`, `MIN_DECAY_TC_S = 0.03 s`, `SOURCE_STOP_BUFFER_S = 0.05 s`. Muted strums additionally cap `noteDuration` at `MUTED_MAX_DURATION_S = 0.08 s`.
  - `cancelStrums()` — stops all tracked `AudioBufferSourceNode`s immediately. Called on manual stop and component unmount.
  - `triggerChordPreview(pitches, ctx, target, when)` — synchronous. Plays MIDI pitches ascending (low→high), 10 ms stagger per note, fixed `CHORD_PREVIEW_DURATION_S = 2.0 s` duration. Uses the fingerpick `pluck` preset (`0250_LK_AcousticSteel_SF2_file`); no-ops silently if the preset has not yet been loaded. Called by `ChordDetailView` to play voicing previews.
- Each scheduler tick creates a per-strum `GainNode` (gain = `strumGainRef.current`) that connects `triggerStrum`'s output to `ctx.destination`.
- `DG`, `UG`, and `""` step values produce no strum sound (scheduler calls are gated by `STEP_TO_SOUND` mapping in `useAudioEngine.ts`).
- Metronome: `OscillatorNode`, 1200 Hz accented / 800 Hz normal, 50 ms duration.
- `setStrumEnabled` and `setMetronomeEnabled` stop and restart playback so the ref update propagates immediately.
- `sixteenth` tick mode with a 2-cell beat interleaves real cells with empty subdivisions (alternating via `nextPlatEmptyCellRef`).
- BPM range: 40–220. Tap tempo uses up to 8 recent taps, resets after 2 seconds of inactivity. The BPM input is a fully custom `div`-based slider (`src/components/strum/BpmSlider.tsx`) — the native `<input type="range">` was replaced to support genre tick marks. 9 ticks at fixed BPM values (60 / 75 / 90 / 100 / 110 / 120 / 130 / 140 / 160) are rendered as dot markers on the track; hovering a segment between ticks shows a genre label tooltip (Slow Practice / Folk / Ballad / Pop Blues / Funk / Pop Rock / Rock / Jazz Hard Rock / Fast Rock). Tick dots change colour depending on whether they fall inside or outside the filled portion. Clicking a tick jumps BPM directly. Drag-pause-then-resume and onPointerUp blur behaviours are preserved.

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

### Fingerpicking Page (`/fingerpick`)

**Files:** `src/app/(main)/fingerpick/page.tsx`, `src/components/fingerpick/TabStaveRow.tsx`, `src/components/fingerpick/useFingerpickAudioEngine.ts`, `src/lib/fingerpickScheduler.ts`, `src/lib/fingerpickToVexFlow.ts`, `src/lib/fingerpickTypes.ts`

**Layout:** Three-panel layout mirroring the strumming machine — pattern library sidebar (left, slide-in overlay on mobile/tablet, always-visible on `lg`+), TAB viewer (centre), controls panel (right). The library sidebar shows a "coming soon" placeholder. The controls panel is fully implemented on desktop. On mobile/tablet (below md breakpoint), controls move to a unified fixed-bottom drawer. On mobile/tablet (below `md`), a hide-on-scroll behaviour is active: scrolling down hides the NavBar (`translateY(-100%)`), the fixed bottom drawer (`translateY(100%)`), and the pattern library floating button (`opacity-0`). Scrolling up ≥ 40px restores all three. Tapping anywhere on the TAB viewer also restores all three — implemented via a `CustomEvent ('fingerpick-controls-restore')` dispatched from `handleTabClick` and listened to in `NavBar.tsx`. The scroll listener targets `tabViewerRef` on desktop and `window` on mobile, selected by `window.innerWidth >= 768` at listener-attach time.

**Data model** (`src/lib/fingerpickTypes.ts`):

```ts
type Duration = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "rest";

type Technique = "hammer-on" | "pull-off" | "slide-up" | "slide-down" | null;

type StringFret = {
    fret: number | null;   // null = string not in play for this slot
    technique: Technique;  // technique applied from the previous slot
    tied: boolean;         // ties this note to the same string in the previous slot
    muted: boolean;        // renders as "x" (palm mute / dead note)
};

type BeatSlot = {
    id: string;
    duration: Duration;
    strings: [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret];
};

type Measure      = { id: string; slots: BeatSlot[] };

type FingerpickPattern = {
    id: string;
    name: string;
    measures: Measure[];
    bpm: number;
    timeSignature: [number, number];
};
```

String index `0` = high e; index `5` = low E. All four `Technique` values (`hammer-on`, `pull-off`, `slide-up`, `slide-down`) are implemented. Techniques such as bend, vibrato, and harmonics are not in the type — they are backlogged.

**Adapter** (`src/lib/fingerpickToVexFlow.ts`):

`fingerpickToVexFlow(measure: Measure): VexFlowRenderData` — pure function, no DOM access. VexFlow note constructors are DOM-free.

```ts
interface VexFlowRenderData {
    notes: StemmableNote[];                   // one TabNote or GhostNote per BeatSlot
    connectors: Array<TabTie | TabSlide>;     // per-string technique connectors between adjacent slots
    tuplets: Tuplet[];                        // one Tuplet wrapper per group of 3 eighth-triplet notes
}
```

Conversion rules:

- A rest slot, or a slot where all strings are silent (all `fret === null` and no `muted`), produces a `GhostNote`.
- Otherwise, a `TabNote` is produced. Each active string (non-null fret or `muted: true`) contributes one position. Muted strings use `fret: "x"`. VexFlow string numbers are 1-indexed: `str = stringIdx + 1`.
- Connectors are generated between adjacent slots that share a string with a non-null `technique` or `tied: true`:
  - `hammer-on` → `TabTie.createHammeron()` (renders "H", returns a `TabTie` instance)
  - `pull-off` → `TabTie.createPulloff()` (renders "P", returns a `TabTie` instance)
  - `slide-up` → `TabSlide.createSlideUp()` (returns a `TabSlide` instance)
  - `slide-down` → `TabSlide.createSlideDown()` (returns a `TabSlide` instance)
  - `tied: true` → `new TabTie(...)` (plain sustain arc)

**Rendering** (`src/components/fingerpick/TabStaveRow.tsx`):

A `"use client"` component that renders one row of measures into a single VexFlow SVG context (SVG backend).

Props: `measures`, `measureWidths: number[]` (one entry per measure — the pre-computed, stretch-scaled pixel width for that measure), `startMeasureNumber?` (1-indexed display label), `startMeasureIndex?` (0-indexed global measure index — enables cursor data attributes).

- A `ResizeObserver` on the container div drives all rendering — it fires on mount with the initial `clientWidth` and on every resize. `requestAnimationFrame` debounces rapid events. The observer is disconnected and the container cleared on unmount.
- Layout: `CLEF_WIDTH = 15 px` left offset, `RIGHT_PAD = 15 px` right padding. Each stave is rendered at the width specified by `measureWidths[i]` — no per-row width calculation occurs inside `TabStaveRow`.
- Only the first stave in each row gets `addTabGlyph()` (the "TAB" clef glyph) — standard notation convention. Staves 2…N suppress their left barline (`Barline.type.NONE`) to avoid double barlines at measure boundaries.
- Measure numbers are rendered when `startMeasureNumber` is provided (1-indexed; `FingerpickPage` increments per row).
- After drawing staves, when `startMeasureIndex` is set: writes `data-stave-{g}-x` and `data-stave-{g}-w` (note-region left offset and width in SVG coordinates) onto the SVG element for each global measure index `g`. The cursor uses these to position the measure-background highlight without recomputing layout math.
- Beams: `Beam.applyAndGetBeams(voice, -1)` is applied after notes are added to the voice (stem direction `−1` = down). Tuplets, connectors, and beams are all drawn after `voice.draw()`.
- After drawing notes, when `startMeasureIndex` is set: writes `data-measure-index` (global) and `data-slot-index` onto each note's SVG element. The cursor RAF loop queries these attributes to locate the note element for the current playback position.
- Font: `"Geist Mono", ui-monospace, monospace` at `10pt`.

`FingerpickPage` derives row layout from a content-driven greedy-wrap algorithm. A `ResizeObserver` on `tabViewerRef` provides `containerWidth` (via `entry.contentRect.width`). For each measure, `fingerpickToVexFlow` is called once to produce `VexFlowRenderData`; the notes array is passed to `computeMeasureMinWidth` (in `TabStaveRow.tsx`) along with a hammer-on/pull-off count derived from `measure.slots` to get the minimum required width. Rows are composed greedily: measures are packed left-to-right until the next measure would overflow `containerWidth`, then a new row starts. After greedy grouping, each row's measure widths are scaled proportionally so the row's total equals exactly `containerWidth` (stretch-to-fill). The resulting `number[]` per row is passed as `measureWidths` to each `TabStaveRow`. No breakpoint-based `measuresPerRow` cap exists — however many measures fit at their content-driven widths, fit. The page renders a single hardcoded `PRESET_FINGERPICK_PATTERN` ("Technique Showcase") — 14 measures covering all six duration values (whole, half, quarter, eighth, sixteenth, eighth-triplet), all four technique types, muted notes, and multi-string chordal slots.

**Sample loading (`useGuitarSampleLoader.ts` additions):**

Two presets are loaded exclusively for the fingerpick engine (shared sample library source with the strum machine):

- `"pluck"` → `0250_LK_AcousticSteel_SF2_file` (LK Acoustic Steel, GM 25)
- `"muted"` → `0280_FluidR3_GM_sf2_file` (FluidR3 Muted Guitar, GM 28)

`preloadFingerpickPresets(ctx: AudioContext): Promise<void>` — fetches and parses both presets, then decodes all zones needed for the full guitar range MIDI 40–76 (open E2 to 20th-fret E4 on the high-e string). Caching follows the same in-flight deduplication pattern used by `preloadStrumPresets`.

`getFingerpickNoteData(type, midi): { buffer, playbackRate }` — synchronous lookup after preload. Playback rate: `2^((100×midi − baseDetune) / 1200)` using the zone's `originalPitch`, `coarseTune`, `fineTune` — identical formula to the strum engine.

**Scheduler** (`src/lib/fingerpickScheduler.ts`):

Pure, DOM-free module containing all timing primitives. Key exports:

- `ScheduleEvent` — `{ time, duration, stringIndex, midi, technique, muted, measureIndex, slotIndex }`. `time` is absolute seconds from pattern start.
- `VoiceHandle` — duck-typed interface (`gainNode.gain.{cancelScheduledValues, setTargetAtTime}`, `source.stop`) so voice-stealing tests can inject mocks without a real `AudioContext`.
- `fingerpickPatternToScheduleEvents(pattern, bpm)` — converts the pattern into a flat, time-sorted `ScheduleEvent[]`. Rest slots and tied strings produce no events. Pitch = `OPEN_STRING_MIDI[stringIndex] + fret` (fret takes priority over muted for pitch; the `muted` flag only drives preset selection and envelope shaping).
- `getTotalPatternDuration(pattern, bpm)` — sum of all slot durations in seconds.
- `computeLoopOffset(passIndex, patternDuration, loopGapSeconds)` — `passIndex × (patternDuration + loopGapSeconds)`.
- `getProgressAtTime(events, elapsed, boundaries?)` — returns `{ measureIndex, slotIndex }` of the event most recently started at `elapsed` seconds. Optional `boundaries?: MeasureBoundary[]` parameter: when provided, if `elapsed` has crossed into a later measure than the last fired event (e.g. a measure whose first slot is a rest/GhostNote), returns `{ measureIndex, slotIndex: 0 }` for that measure rather than holding the previous measure's last event. Used by the RAF cursor loop.
- `computeMeasureBoundaries(pattern, bpm)` — returns `MeasureBoundary[]` (one entry per measure with its absolute start time in seconds). Recomputed in `FingerpickPage` whenever `pattern` or `bpm` changes, stored in `measureBoundariesRef`, and passed to `getProgressAtTime` in the RAF tick.
- `findSlotStartTime(events, measureIndex, slotIndex)` — given a musical position, returns its absolute time in an event list; used when changing BPM to map the old-BPM position to the new-BPM timeline.
- `stealVoice(voices, stringIndex, when)` — cancels scheduled gain automation, applies a 5 ms τ fade-out, and stops the source; exported for unit testing without a real `AudioContext`.
- `_shutdownEngine(voices, timerIds, allSources?)` — stops all tracked sources and clears timers; exported for testing.

**Audio engine** (`src/components/fingerpick/useFingerpickAudioEngine.ts`):

Self-contained hook. Lifecycle: `load()` → `play(pattern, options, startOffset?)` → `pause()` / `resume()` → `stop()`. Cleanup runs in `useEffect` return.

- **AudioContext lifecycle:** `ensureContext()` creates a fresh context (closing any existing one first) — avoids zombie-context suspension after idle/backgrounding. Both the master gain node (`masterGainRef`) and the dedicated metronome gain node (`metronomeGainNodeRef`) are created here and persist across pause/resume cycles.
- **Precomputed schedule:** `fingerpickPatternToScheduleEvents()` is called once at `play()` time and again on every `applyBpmChange()`. All events for a pass are handed to the Web Audio scheduler synchronously at play/resume time.
- **Per-string voice stealing:** `perStringVoicesRef: Map<number, ActiveVoice>` holds the last active voice per string. A new note on string N calls `stealVoice()` (5 ms τ fade, immediate stop) before starting the new source.
- **`allSourcesRef: Set<AudioBufferSourceNode>`** — superset of `perStringVoicesRef` sources; also contains intermediate sources that were voice-stolen by later events in the same scheduling pass but whose `source.start(futureTimestamp)` was already handed to the Web Audio scheduler. Pause/stop cancels all of them. Each source removes itself via `onended`.
- **`allMetronomeSourcesRef: Set<OscillatorNode>`** — same pattern for metronome oscillators.
- **Loop scheduling:** `schedulePassAndQueue(passIndex, passStartOffset?)` schedules a full pass synchronously then queues the next pass via `setTimeout` firing `SCHEDULE_LOOKAHEAD_S = 0.3 s` before the current pass ends.
- **`applyBpmChange(newBpm)`:** If playing — cancels all sources, finds the current musical position via `getProgressAtTime`, maps it to the new-BPM timeline via `findSlotStartTime`, then reschedules from that position (no audible restart). If paused — converts `pausedAtRef` to the equivalent new-BPM time. If stopped — no-op.
- **`applyLoopGapChange(newLoopGapSeconds)`:** If playing and looping — recalibrates `startTimeRef` so `computeLoopOffset` remains consistent, resets the scheduling timer with the corrected delay. No audio cancellation — notes already playing in the current pass are unaffected.
- **`seekToNote(measureIndex, slotIndex)`:** If playing — cancels all sources and reschedules from the target note (same seek-and-reschedule mechanism as `applyBpmChange`). If paused — updates `pausedAtRef` so `resume()` plays from there.
- **`getPlaybackProgress()`:** Synchronous getter returning `{ measureIndex, slotIndex, passIndex, elapsed }`. Called from the page's rAF loop without triggering re-renders.
- **Metronome:** Oscillator-based. 1200 Hz accented / 800 Hz normal / 50 ms duration. Routed through a dedicated `metronomeGainNodeRef` (shared gain node) for live volume control without rescheduling. `handleSetMetronomeEnabled(true)` mid-pass immediately reschedules the remaining beats of the current pass from the current elapsed position. `handleSetMetronomeSubdivision` cancels all pending oscillators and reschedules the current pass at the new density (quarter / eighth / sixteenth).
- **Note envelope:** Gain decay per note: `setTargetAtTime(0, when, max(duration × 0.8, 0.03 s))`. Technique notes (hammer-on, pull-off, slide) use a reduced gain (`TECHNIQUE_GAIN = 0.5`) to simulate legato dynamics.

**Controls panel** (`src/app/(main)/fingerpick/page.tsx`):

Fully implemented; no longer a placeholder. Controls (right panel, `md:w-55 lg:w-70`):

- **Play/Pause** toggle (CirclePlay / CirclePause, 56 px icons); becomes a Stop button (`CircleStop`) while playing or paused.
- **BPM slider** (40–220). Drag gesture: `onPointerDown` pauses playback and records `wasPlayingRef`; `onChange` updates display and `dragBpmRef` only; `onPointerUp` calls `applyBpmChange(dragBpmRef.current)` then resumes if `wasPlayingRef`. Keyboard arrow keys on the focused slider reschedule immediately (no pointer-down guard active).
- **±10 BPM buttons** and large BPM display.
- **Tap Tempo** — up to 8 taps, resets after 2 s idle; computes average interval and calls `applyBpmChange`.
- **Play Once** toggle (Switch) — if on, loop machinery schedules only one pass then stops.
- **Loop Gap** selector (0 s / 5 s / 10 s pill buttons) — greyed/disabled while Play Once is active; calls `applyLoopGapChange` immediately on change.
- **Note Sound** volume slider (0–200%).
- **Metronome** toggle, **Accent Beat 1** toggle, **Subdivision** (1/4 / 1/8 / 1/16 pill buttons), **Metronome volume** slider — all greyed when metronome is off.
- **Spacebar** keybinding toggles Play/Pause; skipped when focus is inside a text input, select, or textarea.

**Mobile controls drawer (below `md` breakpoint only):**
A single `fixed bottom-0 left-0 right-0 z-30` container replaces the right-panel controls on mobile. Two stacked children:
- **Main bar (always visible):** BPM number (tap-to-open vertical slider popover, `fixed`-positioned via `getBoundingClientRect` to avoid overflow clipping), Loop/Once segmented pill control, Metronome icon toggle (`text-denim` when active), ChevronUp/Down toggle, Stop + Play/Pause flush right.
- **Collapsible panel:** Animates via `max-height` transition with cubic-bezier `(0.32, 0.72, 0, 1)`. Contains: Tap Tempo, BPM horizontal slider (synced to main BPM state), Note Sound volume, Accent Beat 1, Subdivision pills, Metronome volume, Loop Gap pills.

Scroll isolation: `onWheel` and `onTouchMove` with `stopPropagation()` on the drawer. A `z-20` transparent backdrop intercepts TAB-area clicks when the panel is open (preventing accidental seek). Drag handle uses `touch-action: none` + `setPointerCapture` to suppress Chrome pull-to-refresh while tracking downward drag to close. Hide-on-scroll: the drawer container has `transition-transform duration-300 ease-out`; `controlsVisible` state drives `translateY(0)` ↔ `translateY(100%)`. `controlsVisibleRef` mirrors the state for use inside the scroll listener closure without stale-closure issues. Auto-scroll (triggered by the RAF row-transition `scrollIntoView`) does not trigger hide: `isAutoScrollingRef` is set `true` before `scrollIntoView` and cleared after 500ms; both the page scroll listener and `NavBar.tsx`'s scroll listener check this flag and skip the hide logic. `NavBar.tsx` is notified via `CustomEvent('fingerpick-autoscroll-start/end')`.

**Cursor / Playhead** (`src/app/(main)/fingerpick/page.tsx`):

Two overlay `div`s absolutely positioned inside `tabViewerRef` (the scrollable TAB viewer):

- `cursorRef` — a 6 px-wide vertical line (`rgba(74,111,165,0.5)`). Horizontal position updated every rAF frame. Vertical position and height updated only on row transitions.
- `measureHighlightRef` — a full-stave-height background block (`rgba(74,111,165,0.07)`). Width and left position updated only on measure transitions, read from `data-stave-{measureIndex}-x/w` attributes.

**rAF loop** (starts when `isPlaying` → `true`, stops when `false`; all updates via direct DOM mutation):

1. Calls `getPlaybackProgress()` to get `{ measureIndex, slotIndex, elapsed, passIndex }`.
2. Queries `[data-measure-index="${measureIndex}"][data-slot-index="${slotIndex}"]` to find the current note element and reads its `getBoundingClientRect` centre as `x0`.
3. Finds the next event in `scheduleEventsRef` with `time > t0`, queries its note element for `x1`. Computes `frac = (elapsed − t0) / (t1 − t0)` and `targetX = x0 + (x1 − x0) × frac`. Guard: if `x1 < x0` (next note is on a different/earlier row), substitutes `x1` with the current measure's right edge (`data-stave-{measureIndex}-x + data-stave-{measureIndex}-w` read from the SVG element) so the cursor continues drifting rightward through the remainder of the measure instead of freezing.
4. Applies exponential smoothing: `renderedX += (targetX − renderedX) × (1 − exp(−λ·Δt))` with `λ = 20`. First frame of each playback session (`prevTimestampRef = 0`) snaps directly to avoid a catch-up slide. Loop-pass boundaries (detected via `passIndex` change) also reset `prevTimestampRef` to force a snap.
5. **Row transition** (when `rowIdx ≠ lastScrolledRowRef`): updates vertical `top`/`height` of both overlays; calls `rowRefs.current[rowIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' })`; resets `prevTimestampRef.current = 0` to force a snap on the next frame (prevents leftward smoothing from the previous row's x position).
6. **Measure transition** (when `measureIndex ≠ lastMeasureIdxRef`): reads `data-stave-{measureIndex}-x/w` from the SVG element to reposition `measureHighlightRef`.

Single-note measure fix: when `!nextEvent || nextEvent.measureIndex !== measureIndex` (`isLastNoteInMeasure`), the cursor drifts to the measure's right edge using `t0Event.duration` (actual scheduled note duration in seconds) rather than the gap to the next event, ensuring correct cursor velocity on whole-note and other terminal-note measures.

Rest-slot cursor drift: when `getProgressAtTime` returns a `slotIndex` whose DOM element does not exist (GhostNote/rest), the RAF tick falls back to a drift interpolation path: reads the measure left edge from `data-stave-{measureIndex}-x`, queries the first non-rest note's element via `[data-measure-index][data-slot-index]` to get `x1`, computes `frac = restElapsed / restDuration` from `measureBoundariesRef` start times, and applies the same exponential smoothing to drift the cursor from the measure left edge toward `x1` over the rest slot's duration. Falls back to a static snap if the target element is not yet in the DOM.

**Click-to-seek:** `onClick` on the tab viewer hit-tests all `[data-measure-index][data-slot-index]` elements in the clicked row's SVG (clamping to the nearest row by Y distance when the click lands between rows), picks the nearest note by X distance, then: calls `seekToNote(measureIndex, slotIndex)` if playing or paused; sets `pendingSeekRef` if stopped (consumed by `handlePlay()`); and calls `snapCursorToNote()` to immediately reposition both overlays bypassing exponential smoothing (`renderedXRef` and `prevTimestampRef` are reset to force a snap on the next tick).

**Initial and post-Stop cursor position:** A rAF retry loop polls until TabStaveRow's ResizeObserver+rAF render completes (data attributes appear in DOM), then positions both overlays at `[data-measure-index="0"][data-slot-index="0"]`. On Stop, `cursorResetTick` state increments, triggering a dedicated `useEffect` that re-runs (without scrolling — scroll position is preserved) the same positioning loop.

Known bug (open issue): on mobile, natural playback end causes the page to scroll to top. Root cause: `lastScrolledRowRef` reset in `isPlaying` cleanup triggers `scrollIntoView` on row 0 via the next RAF tick. Fix attempts reverted; tracked as a GitHub issue.

**Testing:**

`fingerpickToVexFlow.ts` has 23 unit tests in `src/components/fingerpick/__tests__/fingerpickToVexFlow.test.ts`, covering: `VEX_DURATION` key mapping (6 cases), silent and rest slots producing `GhostNote` (3 cases), single-note `TabNote` construction and VexFlow string-index mapping (5 cases), all four technique connectors and tied notes plus the no-connector baseline (6 cases), and beam grouping via `Beam.applyAndGetBeams` (3 cases). Tests assert against output object types and graph structure — not rendered pixel positions — because jsdom lacks a real Canvas/text-measurement implementation (see Known Issue #8).

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

- **`src/lib/chordVoicingToVexChords.ts`** — Pure adapter (no DOM/React). Converts a `ChordVoicing` DB row (6-char `frets`/`fingers` strings, relative `start_fret`, optional `barre_fret`/`capo`) into a `VexChordDef` for the vexchords `ChordBox`. Barre detection: `capo=true` → full 6-string barre; otherwise finds all non-muted strings sharing the `barre_fret` digit and computes `fromString`/`toString` span. Also exports `selectStandardVoicing` (returns the "Standard"-labelled voicing, or the one with the lowest `start_fret` as fallback) and `decodeVoicingStrings` (returns `DecodedString[]` with absolute guitar fret numbers, used by `chordVoicingToMidi`).

- **`src/lib/chordVoicingToMidi.ts`** — Pure function. Converts a `ChordVoicing` into `ChordMidiNote[]` (one entry per non-muted string) using `decodeVoicingStrings` and `GUITAR_OPEN_MIDI` (standard tuning open-string pitches: `[40, 45, 50, 55, 59, 64]`, index 0 = low E). Called by `chords/[rootSlug]/[suffixSlug]/page.tsx` (server component) to compute pitches passed to `ChordDetailView`.

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

- **`ChordDetailView.tsx`** — Voicing grid for the detail page. Shows all voicings for a single chord using full-size `ChordDiagram` components. Each voicing card has a Play button: MIDI pitches are pre-computed server-side via `chordVoicingToMidi()` and passed in as the `pitches` prop of each `VoicingCard`. Client-side playback calls `triggerChordPreview(pitches, ctx, destination, currentTime)` from `useGuitarSampleLoader`, which uses the `pluck` preset (`0250_LK_AcousticSteel_SF2_file`). `preloadFingerpickPresets` is lazy-loaded on the first play click (not on page mount); subsequent plays in the same session are instant via the module-level cache in `useGuitarSampleLoader.ts`.

**Attribution:** `@tombatossals/chords-db` (MIT) and `vexchords` are in `package.json`. The in-app footer credit for `@tombatossals/chords-db`, `vexchords`, and WebAudioFont is rendered by `src/app/(main)/chords/layout.tsx`, which wraps all `/chords/**` routes. `THIRD_PARTY_LICENSES.md` at the repo root is still not present — see Backlog.

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
- **Third-party attribution** — add `THIRD_PARTY_LICENSES.md` at the repo root (in-app footer credit for the Chord Library pages is already present).
- **Atomic reordering** — replace the two-update `swapRoutineExerciseOrder` with a Supabase RPC.
