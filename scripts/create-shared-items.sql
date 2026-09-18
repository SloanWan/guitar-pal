-- shared_items: public snapshot links for patterns (issue #215).
-- Run once in the Supabase SQL editor (or via `supabase db` tooling). Idempotent.
--
-- Shape:
--   * `id` is the whole secret: a 10-character random base62 string minted by
--     the client (`newShareId` in src/lib/sharedItems.ts). Anyone holding the
--     link can read the row; there is no listing, so an id cannot be browsed to.
--   * `payload` is a copy of the pattern at share time — a snapshot, not a link
--     to the owner's row. The source tables stay owner-only under RLS, the link
--     survives the original being edited or deleted, and the viewer sees exactly
--     what the sharer saw. Read back through the validators, never cast.
--       kind = 'fingerpick': a FingerpickPattern
--       kind = 'strum':      { pattern: StrumPattern, progression?: ChordProgression }
--   * No update policy: a snapshot is immutable. Re-share for a new version.
--
-- Security shape (reviewed against CLAUDE.md constraints — violates none of the four):
--   * RLS on. Select is open to anon + authenticated — the id is the capability.
--     Insert/delete are row-scoped by owner_id, so only a signed-in user can
--     create a share and only its owner can revoke it.

create table if not exists public.shared_items (
  id         text primary key,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.shared_items
    add constraint shared_items_kind check (kind in ('fingerpick', 'strum'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.shared_items
    add constraint shared_items_id_shape check (id ~ '^[A-Za-z0-9]{10}$');
exception
  when duplicate_object then null;
end $$;

create index if not exists shared_items_owner_idx
  on public.shared_items (owner_id, created_at desc);

alter table public.shared_items enable row level security;

drop policy if exists "read shared item by id" on public.shared_items;
create policy "read shared item by id"
  on public.shared_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists "insert own shared items" on public.shared_items;
create policy "insert own shared items"
  on public.shared_items
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "delete own shared items" on public.shared_items;
create policy "delete own shared items"
  on public.shared_items
  for delete
  to authenticated
  using (auth.uid() = owner_id);

comment on table public.shared_items is
  'Public snapshot links: a copy of a pattern anyone with the id can open in the player.';
