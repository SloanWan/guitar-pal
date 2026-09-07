-- user_pattern_progressions.synced_beats / .follows_pattern: whether a chord
-- sequence still follows the rhythm of the pattern it was written over.
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- Why these exist: editing a pattern used to rewrite every sequence over it,
-- silently, at a moment the player was looking at the pattern editor rather than
-- at the sequence. The decision now happens when the sequence is opened, which
-- means the sequence has to remember two things.
--
--   * `synced_beats` is the pattern rhythm this sequence was last reconciled
--     with — the same jsonb shape as `bars[n].beats`, i.e. StepValue[][]. It is
--     a snapshot rather than a dirty flag because it is also the "before"
--     argument the sync itself needs to tell a bar that followed the pattern
--     from one the player re-wrote.
--   * `follows_pattern` is false once the player has declined. Null means
--     "still following" — the same as true.
--   * `sync_notice_dismissed` is true once the player has dismissed the standing
--     "not following the pattern" notice. Not derivable from the other two: a
--     sequence can have stopped following and still want to be reminded that it
--     has. Cleared when the player sets it back to following.
--
-- Additive only — nothing existing changes:
--   * Both are nullable. A row with no `synced_beats` predates the prompt: there
--     is no baseline to diff against, so the app backfills it quietly on first
--     open and never asks about a change nobody can describe.
--   * Rolling back to pre-prompt code simply ignores both columns.
--
-- No RLS change needed: existing user_pattern_progressions policies are
-- row-scoped by user_id and apply to the new columns automatically.

alter table public.user_pattern_progressions
  add column if not exists synced_beats jsonb,
  add column if not exists follows_pattern boolean,
  add column if not exists sync_notice_dismissed boolean;

comment on column public.user_pattern_progressions.synced_beats is
  'Pattern rhythm (StepValue[][]) this sequence was last reconciled with. Null for rows written before the reconcile prompt; those are backfilled on first open.';

comment on column public.user_pattern_progressions.follows_pattern is
  'False once the player declined to follow the pattern. Null means still following.';

comment on column public.user_pattern_progressions.sync_notice_dismissed is
  'True once the player dismissed the standing "not following the pattern" notice. Null means show it.';
