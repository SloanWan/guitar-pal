-- user_pattern_progressions: chord sequences a user attaches to a strum pattern.
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- Shape:
--   * `pattern_id` is a plain text id, not a foreign key: a progression can hang
--     off a preset pattern (ids like '4-4 old faithful', defined in code) just as
--     well as off a row in user_strum_patterns.
--   * `bars` is the same jsonb shape the pattern editor already writes:
--     [{ beats: StepValue[][], chord: { root, suffix, voicingId? } | null }]
--     Chord identity only — frets/pitches are always looked up from
--     chords / chord_voicings, never stored inline.
--   * `order_index` orders the progression list shown for one pattern.
--   * `name` is optional: null means the UI writes the chord abbreviations
--     ("C|G|Am|F") instead. `bpm` is optional too — null means the progression
--     plays at the tempo of the pattern it extends.
--   * `capo` is the fret the shapes are fingered behind: the chords name the
--     shapes the player holds, so playback sounds `capo` semitones higher.
--     0 / null = no capo.
--
-- Security shape (reviewed against CLAUDE.md constraints — violates none of the four):
--   * RLS on, every policy row-scoped by user_id, so a user only ever sees and
--     edits their own progressions.

create table if not exists public.user_pattern_progressions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  pattern_id  text not null,
  bars        jsonb not null,
  order_index smallint not null default 0,
  name        text,
  bpm         smallint,
  capo        smallint,
  created_at  timestamptz not null default now()
);

-- Columns added after the table first shipped; the create above only applies to
-- a fresh database, so bring an existing table up to date too.
alter table public.user_pattern_progressions
  add column if not exists name text;
alter table public.user_pattern_progressions
  add column if not exists bpm smallint;
alter table public.user_pattern_progressions
  add column if not exists capo smallint;

do $$
begin
  alter table public.user_pattern_progressions
    add constraint user_pattern_progressions_name_length check (name is null or char_length(name) <= 60);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.user_pattern_progressions
    add constraint user_pattern_progressions_bpm_range check (bpm is null or (bpm between 40 and 220));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.user_pattern_progressions
    add constraint user_pattern_progressions_capo_range check (capo is null or (capo between 0 and 12));
exception
  when duplicate_object then null;
end $$;

create index if not exists user_pattern_progressions_owner_idx
  on public.user_pattern_progressions (user_id, pattern_id, order_index);

alter table public.user_pattern_progressions enable row level security;

drop policy if exists "read own progressions" on public.user_pattern_progressions;
create policy "read own progressions"
  on public.user_pattern_progressions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "insert own progressions" on public.user_pattern_progressions;
create policy "insert own progressions"
  on public.user_pattern_progressions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "update own progressions" on public.user_pattern_progressions;
create policy "update own progressions"
  on public.user_pattern_progressions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own progressions" on public.user_pattern_progressions;
create policy "delete own progressions"
  on public.user_pattern_progressions
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.user_pattern_progressions is
  'Chord sequences (multi-bar, per-bar chord) a user attached to a strum pattern, preset or custom.';
