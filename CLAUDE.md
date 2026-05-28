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

**Auth flow:** `/auth` page handles sign-in/sign-up via `src/lib/auth.ts`. The dashboard (`/dashboard`) is a client component that checks auth on mount via `getUser()` and redirects to `/auth` if not authenticated. There is no middleware-based route protection — it's all client-side.

**Supabase client:** `src/lib/supabase.ts` exports `createClient()` using `createBrowserClient` from `@supabase/ssr`. All lib functions call this to get a client instance. Env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Data layer:** `src/lib/` contains thin Supabase query functions — no ORM, no server actions. All DB calls happen client-side from components or lib files directly. Tables: `exercises`, `routines`, `routine_exercises` (join table with `order_index` and `duration_minutes`). Types defined in `src/types/database.ts`.

**Exercise categories** are a fixed union type: `"chord" | "scale" | "fingering" | "strumming"`.

**Component pattern:** Feature components (e.g. `ExerciseList`, `RoutineList`) live in `src/components/` and are marked `"use client"`. They handle their own data fetching and local state. UI primitives from shadcn live in `src/components/ui/`.
