-- shared_items.expires_at: a share that stops opening after a date (issue #308).
-- Run once in the Supabase SQL editor, BEFORE deploying the code that reads the
-- column: `loadShare` selects it, so every /p/<id> page fails until it exists.
-- Idempotent.
--
-- Null means forever, which is what every share made in the app is and what
-- every existing row becomes. The MCP server (src/app/api/mcp/route.ts) writes
-- its shares with a date `MCP_SHARE_TTL_DAYS` out, since a conversation with
-- Claude mints a new link on every revision and nobody comes back for the old
-- ones. `loadShare` (src/lib/sharedItems.ts) treats an expired row as absent;
-- the delete below is the actual cleanup, to run by hand or from pg_cron.

alter table public.shared_items
  add column if not exists expires_at timestamptz null;

create index if not exists shared_items_expires_idx
  on public.shared_items (expires_at)
  where expires_at is not null;

comment on column public.shared_items.expires_at is
  'After this the link no longer opens; null never expires. Set by the MCP server, not by the app.';

-- Cleanup. Schedule with pg_cron if the extension is on, e.g. daily at 04:00 UTC:
--   select cron.schedule('shared-items-expiry', '0 4 * * *',
--     $$delete from public.shared_items where expires_at < now()$$);
-- or run it by hand now and then:
-- delete from public.shared_items where expires_at < now();
