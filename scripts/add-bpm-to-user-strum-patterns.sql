-- user_strum_patterns.bpm: the tempo a pattern loads at, set in the pattern editor.
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- Additive only — nothing existing changes:
--   * `bpm` is nullable; every stored row reads back as the client default (80)
--     via `normalizeBpm()` in src/lib/strumBars.ts.
--   * Values are clamped client-side to the transport fader bounds (40–220); the
--     check constraint below keeps an out-of-range write from ever landing.
--
-- No RLS change needed: existing user_strum_patterns policies are row-scoped by
-- user_id and apply to the new column automatically.

alter table public.user_strum_patterns
  add column if not exists bpm smallint;

do $$
begin
  alter table public.user_strum_patterns
    add constraint user_strum_patterns_bpm_range check (bpm is null or (bpm between 40 and 220));
exception
  when duplicate_object then null;
end $$;

comment on column public.user_strum_patterns.bpm is
  'Default tempo in BPM (40-220). Null for legacy rows; the client falls back to 80.';
