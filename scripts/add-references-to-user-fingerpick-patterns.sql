-- user_fingerpick_patterns.reference_links: a tab's reference links (#434) —
-- where it came from (a video, a track, a page), stored beside the measures the
-- way `capo` and `spans` are. Named reference_links because REFERENCES is a
-- reserved word. Run once in the Supabase SQL editor BEFORE deploying the build
-- that reads it: the load selects the column. Idempotent.
--
-- Additive only — nothing existing changes:
--   * `reference_links` is nullable; null and [] both read back as "no links".
--   * The app checks every entry on read (`readReferences`: http(s) only,
--     at most 10), so the column holds plain jsonb.
--
-- No RLS change needed: existing user_fingerpick_patterns policies are
-- row-scoped by user_id and apply to the new column automatically.
--
-- Afterwards: `npm run db:schema` and commit the snapshot.

alter table public.user_fingerpick_patterns
  add column if not exists reference_links jsonb;

comment on column public.user_fingerpick_patterns.reference_links is
  'Reference links (#434): [{id, url, label?}], http(s) URLs only, at most 10. Null = none.';
