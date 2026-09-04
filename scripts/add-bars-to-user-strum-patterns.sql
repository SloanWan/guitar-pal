-- user_strum_patterns.bars: multi-bar strum patterns with a per-bar chord.
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- Additive only — nothing existing changes:
--   * `bars` is nullable; every stored row keeps its `beats` and reads back as a
--     single chordless bar via `toBars()` in src/lib/strumBars.ts.
--   * The client double-writes `beats` (= bars[0].beats) alongside `bars`, so
--     rolling back to pre-multi-bar code still plays the first bar rather than
--     losing the pattern.
--   * Shape stored: [{ beats: StepValue[][], chord: { root, suffix, voicingId? } | null }]
--     Chord identity only — frets/pitches are always looked up from
--     chords / chord_voicings, never stored inline.
--
-- No RLS change needed: existing user_strum_patterns policies are row-scoped by
-- user_id and apply to the new column automatically.

alter table public.user_strum_patterns
  add column if not exists bars jsonb;

comment on column public.user_strum_patterns.bars is
  'Multi-bar pattern: [{beats, chord}]. Null for legacy single-bar rows; beats stays in sync with bars[0].beats.';
