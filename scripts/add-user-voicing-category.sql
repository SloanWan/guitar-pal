-- user_chord_voicings.category: the browse category a player filed their own
-- chord under. Run once in the Supabase SQL editor (or via `supabase db`
-- tooling). Idempotent.
--
-- Why it exists: a shape written for a chord the library carries is browsed
-- under that chord's own category, derived from its suffix. A chord the player
-- invented — which is what the "create this chord" flow produces — usually has a
-- suffix the taxonomy has never heard of, so deriving a category files it
-- nowhere and it can only ever be found by typing its name back exactly. The
-- creator is asked where it belongs, once, and this is that answer.
--
-- Additive only — nothing existing changes:
--   * Nullable. Null means "wherever its suffix says", which is how every row
--     written before this behaved and still behaves.
--   * Only a name the app's taxonomy carries is read back; anything else is
--     treated as null rather than filing the chord somewhere nothing browses.
--   * Rolling back to pre-category code simply ignores the column.
--
-- No RLS change needed: existing user_chord_voicings policies are row-scoped by
-- user_id and apply to the new column automatically.

alter table public.user_chord_voicings
  add column if not exists category text;

comment on column public.user_chord_voicings.category is
  'Browse category the player filed this chord under (CHORD_SUFFIX_CATEGORIES name). Null means derive it from the suffix.';
