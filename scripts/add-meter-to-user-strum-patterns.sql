-- user_strum_patterns.meter: time signature for a strum pattern.
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- Why the column exists: a three-cell beat is ambiguous without it. The same
-- stored bar reads as two dotted-quarter beats of 6/8 or as two triplet beats of
-- 4/4, and nothing else in the row distinguishes them. See src/lib/strumMeter.ts.
--
-- Additive only — nothing existing changes:
--   * `meter` is nullable; every stored row reads back as [4,4] via
--     `normalizeMeter()`, which is exactly how those patterns are played and
--     drawn today, so no row changes meaning.
--   * Shape stored: a two-element JSON array, [top, bottom] — e.g. [4,4], [6,8].
--     Only the meters in SUPPORTED_METERS are written; anything else read back
--     falls back to [4,4] rather than being trusted.
--   * Rolling back to pre-meter code simply ignores the column.
--
-- No RLS change needed: existing user_strum_patterns policies are row-scoped by
-- user_id and apply to the new column automatically.

alter table public.user_strum_patterns
  add column if not exists meter jsonb;

comment on column public.user_strum_patterns.meter is
  'Time signature as [top, bottom], e.g. [4,4] or [6,8]. Null for rows written before meters existed; those read back as [4,4].';
