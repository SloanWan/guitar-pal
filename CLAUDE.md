# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

No test suite is configured yet.

## Stack

- **Next.js 16** (App Router) with React 19 — check `node_modules/next/dist/docs/` before using Next.js APIs, as this version may differ from training data
- **Supabase** (`@supabase/ssr`) for auth and database
- **Tailwind CSS v4** for styling
- **shadcn/ui** components (Radix UI primitives) in `src/components/ui/`
- **TypeScript** throughout

## Architecture

**Auth flow:** `/auth` page handles sign-in/sign-up via `src/lib/auth.ts`. The dashboard is a server component that reads the user via `createSupabaseServer()`. Feature components are client components that call `getUser()` themselves if needed. There is no middleware-based route protection.

**Two Supabase clients:**

- `src/lib/supabase.ts` — `createClient()` via `createBrowserClient`, used in client components and all lib query functions
- `src/lib/supabase-server.ts` — `createSupabaseServer()` via `createServerClient` + `cookies()`, used only in server components (e.g. `dashboard/page.tsx`)

Env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Data layer:** `src/lib/` contains thin Supabase query functions — no ORM, no server actions. All DB calls happen client-side. Tables:

- `exercises`, `routines`, `routine_exercises` (join table with `order_index` and `duration_minutes`)
- `practice_logs` — immutable records written at end of a session (fields: `routine_id`, `routine_name`, `duration_minutes`, `rating`, `notes`, `completed_at`)
- `exercise_logs` — per-exercise records (fields: `exercise_id`, `exercise_name`, `duration_minutes`, `reps`, `notes`, `logged_at`)

Types defined in `src/types/database.ts`.

**Exercise categories** are a fixed `as const` array exported as `CATEGORIES` from `src/types/database.ts`: `"chord" | "chord_change" | "picking" | "scale" | "strumming" | "fingering" | "ear_training" | "arpeggio" | "theory" | "song"`.

**Session flow:** `/session/[routineId]` is a client component with a local timer state machine (`idle → running → paused → completed → all_done`). On `all_done`, it collects rating + notes and calls `createPracticeLog()`, then redirects to `/dashboard`.

**Component pattern:** Feature components (e.g. `ExerciseList`, `RoutineList`) live in `src/components/` and are marked `"use client"`. They handle their own data fetching and local state. UI primitives from shadcn live in `src/components/ui/`.
