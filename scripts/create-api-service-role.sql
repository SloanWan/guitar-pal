-- api_service: the Postgres role the Java api-service connects as (#472).
-- Run once in the Supabase SQL editor. Idempotent. Then run `npm run db:schema`
-- and commit the snapshot.
--
-- Replace the password, then put the connection in the server .env as
--   API_DATABASE_URL=jdbc:postgresql://<pooler-host>:5432/postgres?sslmode=require
--   API_DATABASE_USER=api_service.<project-ref>
--   API_DATABASE_PASSWORD=<password>
-- (the pooler wants the project ref after the role name; session mode on 5432,
-- or transaction mode on 6543 with &prepareThreshold=0 added to the URL).
--
-- Shape:
--   * LOGIN and NOINHERIT; everything else is CREATE ROLE's default, which is
--     already no SUPERUSER / CREATEDB / CREATEROLE / BYPASSRLS — the same shape as
--     book_service (create-book-service-role.sql says why nothing more is spelled out).
--   * The role is not exempt from RLS, and the user tables' policies are written
--     `to authenticated`, so each table it reads needs a policy of its own as well as
--     the grant. The policy is `using (true)`: Postgres cannot tell which player a
--     request is for, so the service keys every query by the verified token's `sub`.
--   * Grants grow one endpoint at a time: each port adds its table here, so the
--     role's reach is visible in one place.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'api_service') then
    create role api_service login noinherit password 'change-me-before-running';
  end if;
end $$;

grant connect on database postgres to api_service;
grant usage on schema public to api_service;

-- GET /v1/me/visits (the example slice).
grant select on public.user_visits to api_service;
drop policy if exists "api_service reads visits" on public.user_visits;
create policy "api_service reads visits"
  on public.user_visits for select to api_service using (true);
