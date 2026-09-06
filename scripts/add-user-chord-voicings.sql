-- user_chord_voicings: chord shapes a player writes themselves.
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- Why a new table rather than rows in `chord_voicings`: that table and `chords`
-- are shared read-only reference data (see CLAUDE.md). User rows there would
-- break that invariant and drag the RLS model along with it. A separate table
-- keeps the reference data reference data.
--
-- Shape — deliberately the same columns `chord_voicings` uses, so a row from
-- either reads as the same `ChordVoicing` and everything downstream (the
-- diagram, the MIDI derivation, `selectRefVoicing`) is unchanged:
--   * `root` / `suffix` say what the shape is functioning as. A borrowed shape
--     still has to be called something — it is what the player reads off the
--     grid while playing — and giving it a chord identity means `ChordRef` stays
--     {root, suffix, voicingId} with no new identity kind for every consumer to
--     learn. `label` carries the player's own name for it, shown in place of the
--     chord name when set.
--   * `frets` / `fingers` are 6-char strings, index 0 = string 6 (low E). A fret
--     char is 'x' (muted), '0' (open) or a digit *relative to start_fret*:
--     absolute = start_fret - 1 + rel. Same convention as `chord_voicings`;
--     src/lib/chordShape.ts is the only place that arithmetic happens.
--   * `start_fret` is the first fret of the five-fret diagram window. The
--     constraint on a shape is its span, not its position: a shape at the ninth
--     fret is as expressible as one at the first.
--   * `barre_fret` is relative to the window too, or null. `capo` stays false:
--     the barre is drawn across the strings actually held at that fret.
--
-- Security shape: rows are per-user and private. RLS on, four policies scoped by
-- auth.uid(), matching user_pattern_progressions.

create table if not exists public.user_chord_voicings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  root text not null,
  suffix text not null,
  label text,
  start_fret smallint not null default 1,
  barre_fret smallint,
  capo boolean not null default false,
  frets text not null,
  fingers text not null default '000000',
  created_at timestamptz not null default now()
);

create index if not exists user_chord_voicings_user_chord_idx
  on public.user_chord_voicings (user_id, root, suffix);

alter table public.user_chord_voicings enable row level security;

drop policy if exists "own voicings are readable" on public.user_chord_voicings;
create policy "own voicings are readable" on public.user_chord_voicings
  for select using (auth.uid() = user_id);

drop policy if exists "own voicings are insertable" on public.user_chord_voicings;
create policy "own voicings are insertable" on public.user_chord_voicings
  for insert with check (auth.uid() = user_id);

drop policy if exists "own voicings are updatable" on public.user_chord_voicings;
create policy "own voicings are updatable" on public.user_chord_voicings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own voicings are deletable" on public.user_chord_voicings;
create policy "own voicings are deletable" on public.user_chord_voicings
  for delete using (auth.uid() = user_id);

comment on table public.user_chord_voicings is
  'Chord shapes a player wrote themselves. Same column shape as chord_voicings so a row from either reads as one ChordVoicing; chords/chord_voicings stay shared read-only reference data.';
