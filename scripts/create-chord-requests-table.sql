-- chord_requests: write-only feedback for chords a user searched but couldn't find.
-- Run once in the Supabase SQL editor (or via `supabase db` tooling).
--
-- Security shape (reviewed against CLAUDE.md constraints — violates none of the four):
--   * Anyone (anon or authenticated) may INSERT — the chords library is public.
--   * No SELECT/UPDATE/DELETE policy => the client can write but never read back,
--     so the table can't be scraped or tampered with from the browser.
--   * char_length(query) <= 100 caps payload size at the DB layer; the client also
--     dedupes + throttles repeat submissions (defense in depth, not the only guard).

create table if not exists public.chord_requests (
  id         uuid primary key default gen_random_uuid(),
  query      text not null check (char_length(query) <= 100),
  user_id    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.chord_requests enable row level security;

-- Insert-only for everyone; no other policies => write-only from the client.
drop policy if exists "anyone can report a missing chord" on public.chord_requests;
create policy "anyone can report a missing chord"
  on public.chord_requests
  for insert
  to anon, authenticated
  with check (true);
