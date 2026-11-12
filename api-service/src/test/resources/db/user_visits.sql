-- user_visits as scripts/schema.sql has it, minus the foreign key to auth.users
-- (a test database has no auth schema). Two players, so a test can see that one
-- never gets the other's rows.
create table if not exists public.user_visits (
  user_id   uuid not null,
  kind      text not null check (kind in ('strum', 'tab', 'chord', 'book')),
  target    text not null check (char_length(target) between 1 and 200),
  count     integer not null default 1 check (count > 0),
  last_at   timestamptz not null default now(),
  primary key (user_id, kind, target)
);

delete from public.user_visits;

insert into public.user_visits (user_id, kind, target, count, last_at) values
  ('11111111-1111-1111-1111-111111111111', 'strum', 'folk-strum', 9, '2026-11-01T10:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'chord', 'C|maj7',     4, '2026-11-03T10:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'tab',   'travis-1',   4, '2026-11-05T10:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 'book',  'b-1',        1, '2026-11-06T10:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 'strum', 'island',    50, '2026-11-07T10:00:00Z');
