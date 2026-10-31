-- user_fingerpick_patterns.spans: the technique model v2's spans (#322) — a
-- palm mute or let ring over a run of slots, anchored on slot ids, stored
-- beside the measures the way `capo` is. Run once in the Supabase SQL editor
-- (or via `supabase db` tooling) BEFORE deploying the model v2 build: the app
-- writes the column on every save. Idempotent.
--
-- Additive only — nothing existing changes:
--   * `spans` is nullable; null and [] both read back as "no spans".
--   * Rows written before model v2 carry their palm-mute / let-ring runs as
--     per-note flags inside `measures`; `migratePattern` folds those into
--     spans on every read, and the next save writes them here. No backfill
--     is needed.
--
-- No RLS change needed: existing user_fingerpick_patterns policies are
-- row-scoped by user_id and apply to the new column automatically.

alter table public.user_fingerpick_patterns
  add column if not exists spans jsonb;

comment on column public.user_fingerpick_patterns.spans is
  'Technique model v2 spans: [{id, kind: palmMute|letRing|slur, from, to, strings?}], anchored on slot ids in `measures`. Null = none.';
