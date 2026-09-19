-- Make every user-owned table let go of its rows when the auth user is
-- deleted (issue #220). Run once in the Supabase SQL editor. Idempotent.
--
-- Deleting an account failed on user_fingerpick_patterns_user_id_fkey: the
-- tables created by hand reference auth.users with the default NO ACTION,
-- while the ones created by scripts here say `on delete cascade`. Rather than
-- name the tables — that is how one was missed — this walks the catalog for
-- every foreign key in `public` that points at auth.users and still has a
-- NO ACTION or RESTRICT delete rule, and recreates it with CASCADE.
--
-- SET NULL is left alone: chord_requests.user_id is `on delete set null` on
-- purpose (a request outlives the account that made it).

do $$
declare
  fk record;
begin
  for fk in
    select
      con.conname,
      con.conrelid::regclass as tbl,
      pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_namespace ns on ns.oid = con.connamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refns on refns.oid = ref.relnamespace
    where con.contype = 'f'
      and ns.nspname = 'public'
      and refns.nspname = 'auth'
      and ref.relname = 'users'
      -- confdeltype: a = no action, r = restrict, c = cascade, n = set null, d = set default
      and con.confdeltype in ('a', 'r')
  loop
    raise notice 'recreating % on % as cascade (was: %)', fk.conname, fk.tbl, fk.def;
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
    execute format('alter table %s add constraint %I %s on delete cascade', fk.tbl, fk.conname, fk.def);
  end loop;
end $$;

-- Every foreign key to auth.users and its delete rule, for checking by eye.
-- Expected: CASCADE everywhere except chord_requests (SET NULL).
select
  con.conrelid::regclass as "table",
  con.conname as constraint_name,
  case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end as on_delete
from pg_constraint con
join pg_namespace ns on ns.oid = con.connamespace
join pg_class ref on ref.oid = con.confrelid
join pg_namespace refns on refns.oid = ref.relnamespace
where con.contype = 'f'
  and ns.nspname = 'public'
  and refns.nspname = 'auth'
  and ref.relname = 'users'
order by 1;
