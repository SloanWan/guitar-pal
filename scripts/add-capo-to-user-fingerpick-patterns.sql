-- user_fingerpick_patterns.capo: the fret a pattern is played behind, set in the
-- pattern editor. Run once in the Supabase SQL editor (or via `supabase db`
-- tooling). Idempotent.
--
-- Additive only — nothing existing changes:
--   * `capo` is nullable; null and 0 both read back as "no capo" via
--     `patternCapo()` in src/lib/fingerpickChords.ts.
--   * The TAB is written relative to the capo (it is the nut) and chord shapes
--     are written as they are; playback sounds `capo` semitones higher. Same
--     0–12 range as user_pattern_progressions.capo; the check constraint keeps
--     an out-of-range write from ever landing.
--
-- No RLS change needed: existing user_fingerpick_patterns policies are
-- row-scoped by user_id and apply to the new column automatically.

alter table public.user_fingerpick_patterns
  add column if not exists capo smallint;

do $$
begin
  alter table public.user_fingerpick_patterns
    add constraint user_fingerpick_patterns_capo_range check (capo is null or (capo between 0 and 12));
exception
  when duplicate_object then null;
end $$;

comment on column public.user_fingerpick_patterns.capo is
  'Capo fret (0-12) the TAB is written behind; playback transposes up by this many semitones. Null = no capo.';
