-- user_assistant_chats: General conversations a player chose to keep (#401).
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- A chat is saved only when the player presses Save, and then follows the
-- conversation: later turns overwrite `messages` and bump `updated_at`. The
-- messages are the panel's transcript as written (text plus the cards the
-- readers made), read back through a validator, never trusted as written.
--
-- Security shape: rows are per-user and private. RLS on, scoped by auth.uid(),
-- matching user_favourite_chords.

create table if not exists public.user_assistant_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  messages jsonb not null check (jsonb_typeof(messages) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_assistant_chats_user_updated_idx
  on public.user_assistant_chats (user_id, updated_at desc);

alter table public.user_assistant_chats enable row level security;

drop policy if exists "own assistant chats are readable" on public.user_assistant_chats;
create policy "own assistant chats are readable" on public.user_assistant_chats
  for select using (auth.uid() = user_id);

drop policy if exists "own assistant chats are insertable" on public.user_assistant_chats;
create policy "own assistant chats are insertable" on public.user_assistant_chats
  for insert with check (auth.uid() = user_id);

drop policy if exists "own assistant chats are updatable" on public.user_assistant_chats;
create policy "own assistant chats are updatable" on public.user_assistant_chats
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own assistant chats are deletable" on public.user_assistant_chats;
create policy "own assistant chats are deletable" on public.user_assistant_chats
  for delete using (auth.uid() = user_id);

comment on table public.user_assistant_chats is
  'General assistant conversations a player saved; the transcript as jsonb, updated as the conversation goes on.';
