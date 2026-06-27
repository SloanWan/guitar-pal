# Guitar Pal — Technical Project Brief

This document is a complete reference for an AI assistant working on this codebase. Read it before touching any file.

---

## Project Overview

**Guitar Pal** is a web-based guitar practice studio targeting beginner-to-intermediate self-taught guitarists. The core loop is: create exercises → assemble them into routines → run timed practice sessions → log the result. A strumming machine with real-time audio playback and a chord library are standalone tools alongside the core loop.

**Current state:** Active development, no test suite. All features work. The chord library UI is an iframe embed (native UI was started but not completed — see Known Issues). Practice logs are written but never displayed. The exercise log table exists but has no UI at all.

---

## Tech Stack

| Layer               | Technology                                 | Version |
| ------------------- | ------------------------------------------ | ------- |
| Framework           | Next.js (App Router)                       | 16.2.4  |
| UI library          | React                                      | 19.2.7  |
| Styling             | Tailwind CSS v4                            | 4.x     |
| Component library   | shadcn/ui (radix-nova style)               | 4.x     |
| Primitive UI        | Radix UI (via shadcn)                      | 1.x     |
| Icons               | lucide-react                               | 1.x     |
| Animations          | framer-motion                              | 12.x    |
| Toast notifications | sonner                                     | 2.x     |
| Auth + Database     | Supabase (`@supabase/ssr`)                 | 0.10.x  |
| Fonts               | Geist Sans + Geist Mono (next/font/google) | —       |
| Language            | TypeScript (strict mode)                   | 5.x     |

**No test suite is configured.** No ORM. No server actions (except `src/lib/chords.ts` which uses `"use server"` but the result is unused). All DB calls happen client-side via the browser Supabase client.

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
│   │   ├── chords/page.tsx      # Server component: queries chord + voicing data, renders ChordsView
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
│   ├── ChordsView.tsx           # Currently just renders an <iframe> from guitarapp.com (see Known Issues)
│   ├── strum/
│   │   ├── StepGrid.tsx         # Pure display: renders beat/cell grid with live highlight
│   │   ├── StepGridCard.tsx     # Card wrapper around StepGrid with pattern name + description
│   │   ├── CreatePatternModal.tsx # Dialog for creating/editing custom patterns
│   │   ├── useAudioEngine.ts    # Web Audio API scheduler, all playback logic
│   │   └── useStrumPatterns.ts  # Custom pattern + favourites state, localStorage/Supabase sync
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
│   ├── chords.ts                # getChord() server action — queries chords + chord_voicings (result unused by current UI)
│   ├── strumPatterns.ts         # StepValue / Beat / TickMode types, StrumPattern interface, PRESET_STRUM_PATTERNS array
│   ├── constants.ts             # CATEGORY_LABELS and CATEGORY_COLORS records
│   └── utils.ts                 # shadcn cn() utility
│
├── types/
│   └── database.ts              # CATEGORIES const array, Category type, Exercise, Routine, RoutineExercise, PracticeLog, ExerciseLog types
│
└── proxy.ts                     # Contains Next.js middleware-shaped auth routing logic — NOT executed (see Critical Known Issues)
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
- **No middleware.** Route protection does not exist at the Next.js edge. The `/dashboard` and `/session/:id` pages have no server-side redirect for unauthenticated users — they simply render empty because Supabase RLS returns no rows. See Critical Known Issues.

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

**Audio engine** (`src/components/strum/useAudioEngine.ts`):

- Uses the Web Audio API directly — no library.
- Scheduler pattern: `setTimeout`-based lookahead loop (100ms lookahead window, 25ms reschedule interval).
- All mutable state that the scheduler reads lives in `useRef` (not `useState`) to avoid stale closures. The matching `useState` values are kept for React renders only. Refs: `bpmRef`, `beatsRef`, `tickModeRef`, `strumEnabledRef`, `strumGainRef`, `metronomeEnabledRef`, `metronomeGainRef`, `accentEnabledRef`, `playOnceRef`.
- **Do not read ref.current values inside React render logic.** Only refs are safe to read inside the scheduler closure.
- Strum sounds are synthesised: white noise buffer (0.2s) → BiquadFilter (bandpass) → GainNode with exponential decay. No audio sample files.
- Strum audio params per type: `D`/`D3` → 800Hz, gain 2.5; `U`/`U3` → 1800Hz, gain 1.2; `X` → 400Hz, gain 2.8. `DG`, `UG`, `""` → silent.
- Metronome: OscillatorNode, 1200Hz accented / 800Hz normal, 50ms duration.
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

**Files:** `src/app/(main)/chords/page.tsx`, `src/components/ChordsView.tsx`, `src/lib/chords.ts`

**Current state:** The server component queries the `chords` and `chord_voicings` tables and passes the data as props to `ChordsView`. However, `ChordsView` ignores all props and renders only an `<iframe src="https://guitarapp.com/chords/embedtool?root=Csharp&theme=system">`. The native chord browsing UI has not been implemented. The `@tombatossals/chords-db` npm package is installed but unused.

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

**There is no active middleware.** `src/proxy.ts` contains Next.js middleware logic (including `export const config = { matcher: [...] }`) but is named `proxy.ts` instead of `middleware.ts` and is therefore never executed by Next.js. If you need to add middleware, rename this file to `src/middleware.ts` or create a new one. The logic inside `proxy.ts` would:

- Redirect unauthenticated users from `/dashboard` and `/session/:path*` to `/`.
- Redirect authenticated users from `/` and `/auth` to `/dashboard`.

Until that file is renamed, the app relies on Supabase RLS returning empty result sets for unauthenticated requests. The dashboard renders empty silently; it does not show a sign-in prompt.

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

1. **`src/proxy.ts` is dead code.** It will never execute as middleware because it is not named `middleware.ts`. If route protection (redirect unauthenticated users from dashboard/session) is desired, rename it to `src/middleware.ts`. Review the matcher and logic before enabling — it currently redirects `/` to `/dashboard` for logged-in users which would break the marketing page.

2. **Chord Library is an iframe.** `ChordsView.tsx` ignores all props and renders a third-party embed. The server-side Supabase query in `chords/page.tsx` and the `chords.ts` server action are wasted on every page load. The `@tombatossals/chords-db` npm package is installed but unused.

3. **Practice history has no UI.** `getPracticeLogs()` exists in `practiceLogs.ts` and data is written after each session, but no component ever calls it or renders the history.

4. **Exercise logs are fully disconnected.** `exerciseLogs.ts` defines `createExerciseLog` and `getExerciseLogs`. Neither is imported anywhere in the UI.

5. **`target_bpm` and `stage` on exercises are orphaned.** Both fields exist in the `Exercise` type and presumably in the database, but no form sets them and no UI displays them.

6. **`swapRoutineExerciseOrder` is not atomic.** It does two fetches and two updates without a transaction. A network failure mid-swap leaves `order_index` in an inconsistent state. Consider a Supabase RPC function if this becomes a problem.

7. **No optimistic updates on routine editing.** Duration changes and exercise additions in the edit dialog wait for the network round-trip before updating UI (except removes, which update state immediately). The UX is acceptable but could be improved.

8. **`ChordsView` state is set but unused.** The component declares `key`, `suffix`, `voicings`, `voicingIndex` state from props but only uses none of them (all render output is the iframe). This dead state can be cleaned up when the native chord UI is implemented.

9. **Custom pattern creator cannot author ghost or triplet cells.** The `STEP_CYCLE` in `CreatePatternModal` only cycles through `["", "D", "U", "X"]`. Patterns containing `DG`, `UG`, `D3`, or `U3` display correctly but can only originate from the preset array.

---

## Backlog / Implied Future Work

These are inferred from scaffolded-but-unused code and obvious gaps:

- **Practice history page** — render `getPracticeLogs()` results, ideally with calendar heatmap or weekly summary.
- **Exercise log UI** — wire up `createExerciseLog` and `getExerciseLogs`; perhaps a per-exercise progress view.
- **Native chord library** — replace iframe with a proper browsing UI using the `chords` + `chord_voicings` Supabase tables and/or `@tombatossals/chords-db` for offline use.
- **Route protection** — rename/activate `proxy.ts` as `middleware.ts` so unauthenticated users can't reach `/dashboard` or `/session/:id`.
- **`target_bpm` on exercises** — add a BPM goal field to the exercise form; could integrate with the strumming machine.
- **`stage` on exercises** — unclear intent; possibly a spaced-repetition difficulty level.
- **Atomic reordering** — replace the two-update `swapRoutineExerciseOrder` with a Supabase RPC.
- **Ghost / triplet cell authoring** — extend the pattern creator to allow `DG`, `UG`, `D3`, `U3`.
