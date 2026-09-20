-- chord_voicings.note: a one-line caption shown under a library voicing (#230).
-- Run once in the Supabase SQL editor before scripts/fix-wrong-chord-voicings.ts,
-- which fills it. Idempotent.
--
-- Two things a card cannot say by shape alone go here:
--   * "Rootless: no Bb sounds …" — a jazz comping shape kept as a Variation even
--     though the root is left to the bass. The audit (audit-chord-voicings.ts)
--     lets a Variation skip the root only when this note says so.
--   * "Hand-written for this library …" — a shape written by hand for #230 rather
--     than taken from a published chord table, so a player knows to trust their
--     ear over the diagram.
--
-- Inversions are not noted here: the bass is computed from the frets and named
-- on the card (#231). The chord page is the only reader; the strum and
-- fingerpick chord strips show the chord name alone.

alter table public.chord_voicings
  add column if not exists note text;
