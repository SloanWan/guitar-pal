-- user_visits: how often a player opens each thing, for Home's "Most opened" (#399).
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Shape:
--   * One row per player and thing: `kind` + `target`. `target` is a plain text id,
--     not a foreign key, the way user_pattern_progressions.pattern_id is:
--       strum  → a strum pattern id (preset or custom)
--       tab    → a fingerpick pattern id (preset or custom)
--       chord  → "root|suffix"
--       book   → a book id
--     Something deleted leaves its row behind; Home skips what it cannot find.
--   * `count` only goes up, through record_visit(), which upserts `count + 1` in one
--     statement, so two tabs opening the same thing never lose a visit.
--
-- Security shape:
--   * RLS on, every policy row-scoped by user_id. No delete policy: "delete my data"
--     clears them with the service role (USER_TABLES), and the account takes them.
--   * record_visit() is security invoker, so it runs under those same policies, and
--     only signed-in users may call it.

create table if not exists public.user_visits (
  user_id   uuid not null references auth.users (id) on delete cascade,
  kind      text not null check (kind in ('strum', 'tab', 'chord', 'book')),
  target    text not null check (char_length(target) between 1 and 200),
  count     integer not null default 1 check (count > 0),
  last_at   timestamptz not null default now(),
  primary key (user_id, kind, target)
);

create index if not exists user_visits_top_idx
  on public.user_visits (user_id, count desc, last_at desc);

alter table public.user_visits enable row level security;

drop policy if exists "read own visits" on public.user_visits;
create policy "read own visits"
  on public.user_visits
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "insert own visits" on public.user_visits;
create policy "insert own visits"
  on public.user_visits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "update own visits" on public.user_visits;
create policy "update own visits"
  on public.user_visits
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.record_visit(p_kind text, p_target text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.user_visits (user_id, kind, target)
  values (auth.uid(), p_kind, p_target)
  on conflict (user_id, kind, target)
  do update set count = public.user_visits.count + 1, last_at = now();
$$;

revoke execute on function public.record_visit(text, text) from public, anon;
grant execute on function public.record_visit(text, text) to authenticated;

comment on table public.user_visits is
  'How many times a player opened each strum pattern, tab, chord and book; Home lists the most opened.';
