-- user_favourite_chords: the chords a player keeps (#387).
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- A chord is its name, `root` + `suffix`, not a voicing: a favourite survives a
-- shape being added, renamed or removed, and a chord the library does not carry
-- (an unnamed one, root '?') can be kept like any other. The pair is the key, so
-- marking a chord twice is a no-op upsert rather than a second row.
--
-- Security shape: rows are per-user and private. RLS on, scoped by auth.uid(),
-- matching user_chord_voicings. There is nothing to update on a favourite, so
-- there is no update policy.

create table if not exists public.user_favourite_chords (
  user_id uuid not null references auth.users (id) on delete cascade,
  root text not null,
  suffix text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, root, suffix)
);

alter table public.user_favourite_chords enable row level security;

drop policy if exists "own favourite chords are readable" on public.user_favourite_chords;
create policy "own favourite chords are readable" on public.user_favourite_chords
  for select using (auth.uid() = user_id);

drop policy if exists "own favourite chords are insertable" on public.user_favourite_chords;
create policy "own favourite chords are insertable" on public.user_favourite_chords
  for insert with check (auth.uid() = user_id);

drop policy if exists "own favourite chords are deletable" on public.user_favourite_chords;
create policy "own favourite chords are deletable" on public.user_favourite_chords
  for delete using (auth.uid() = user_id);

comment on table public.user_favourite_chords is
  'Chords a player keeps, by name (root + suffix) so a favourite outlives any voicing change.';
