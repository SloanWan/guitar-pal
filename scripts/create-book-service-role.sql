-- book_service: the Postgres role the Python book-service connects as.
-- Run once in the Supabase SQL editor, BEFORE the service's Alembic migrations
-- (they grant on their tables to this role, so it has to exist). Idempotent.
--
-- Replace the password, then put the connection string in the server .env as
-- BOOK_SERVICE_DATABASE_URL, e.g.
--   postgresql://book_service:<password>@<pooler-host>:6543/postgres
--
-- Shape:
--   * LOGIN and NOINHERIT; everything else is CREATE ROLE's default, which is
--     already no SUPERUSER / CREATEDB / CREATEROLE / BYPASSRLS. (Spelling those
--     out in an ALTER ROLE fails on Supabase, where `postgres` is not a real
--     superuser and may not touch the SUPERUSER / BYPASSRLS attributes even to
--     turn them off.) The role can only do what the migrations grant, which is
--     DML on the book tables; DDL runs as an admin role through
--     BOOK_SERVICE_MIGRATION_DATABASE_URL.
--   * Nothing is granted here on purpose: each migration that creates a table
--     grants on it, so the role's reach is visible in one place per table.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'book_service') then
    create role book_service login noinherit password 'change-me-before-running';
  end if;
end $$;

grant connect on database postgres to book_service;
grant usage on schema public to book_service;
-- Foreign keys to auth.users are checked as the table owner, so no grant on
-- the auth schema is needed.
