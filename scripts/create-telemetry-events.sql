-- telemetry_events: the site's own error reports and Web Vitals (#447).
-- Run once in the Supabase SQL editor, then `npm run db:schema`. Idempotent.
--
-- Shape:
--   * One row per event. `kind` is 'error' or 'vital':
--       error → source ('window' | 'rejection' | 'boundary' | 'component' | 'server'),
--               message, stack (trimmed), digest (the id the error screen shows)
--       vital → name ('LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'), value, rating
--   * `route` is the route's pattern (/chords/[rootSlug]/[suffixSlug]), never a URL
--     with ids or a query; `viewport` is 'phone' / 'desktop' (null for a server error).
--   * No user id, no IP: nothing here says who saw what.
--
-- Security shape:
--   * RLS on with no policies, and every privilege revoked from anon and
--     authenticated: only the service role (the /api/telemetry route and the
--     server's onRequestError) writes, and reading is the dashboard's or SQL's.

create table if not exists public.telemetry_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  kind        text not null check (kind in ('error', 'vital')),
  source      text check (source in ('window', 'rejection', 'boundary', 'component', 'server')),
  name        text check (name in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value       double precision,
  rating      text check (rating in ('good', 'needs-improvement', 'poor')),
  message     text check (char_length(message) <= 300),
  stack       text check (char_length(stack) <= 2000),
  digest      text check (char_length(digest) <= 64),
  route       text not null check (char_length(route) between 1 and 120),
  viewport    text check (viewport in ('phone', 'desktop')),
  build       text check (char_length(build) <= 64),
  user_agent  text check (char_length(user_agent) <= 200),
  check (
    (kind = 'error' and source is not null and message is not null and name is null and value is null)
    or (kind = 'vital' and name is not null and value is not null and rating is not null and source is null)
  )
);

create index if not exists telemetry_events_kind_at_idx
  on public.telemetry_events (kind, at desc);

create index if not exists telemetry_events_vitals_idx
  on public.telemetry_events (name, route, at desc)
  where kind = 'vital';

alter table public.telemetry_events enable row level security;

revoke all on table public.telemetry_events from anon, authenticated;

comment on table public.telemetry_events is
  'Error reports and Web Vitals the site sends about itself (#447); written by the service role only.';

-- What to ask of it, for a start:
--
--   -- p75 of each vital per route and screen, last 7 days
--   select route, viewport, name,
--          percentile_cont(0.75) within group (order by value) as p75,
--          count(*) as n
--   from public.telemetry_events
--   where kind = 'vital' and at > now() - interval '7 days'
--   group by route, viewport, name
--   order by route, viewport, name;
--
--   -- errors by message, last 24 hours
--   select source, route, message, count(*), max(at) as last
--   from public.telemetry_events
--   where kind = 'error' and at > now() - interval '1 day'
--   group by source, route, message
--   order by count(*) desc;
