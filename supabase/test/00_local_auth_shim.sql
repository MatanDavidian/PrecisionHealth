-- Local-only stand-in for the parts of Supabase this schema depends on.
--
-- NOT part of the deployed migrations: Supabase provides `auth.users` and
-- `auth.uid()` itself. This exists so the schema, its policies and its grants
-- can be verified against plain Postgres, without running the whole Supabase
-- stack.
--
-- `auth.uid()` reads a session setting exactly as the real one reads the JWT
-- claim, so `set local request.jwt.claim.sub = '<uuid>'` impersonates a signed
-- in user.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- The roles the client connects as, mirroring Supabase's.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

grant usage on schema public to authenticated, anon;
-- Real Supabase grants this; the shim must too, or policies calling auth.uid()
-- fail with "permission denied for schema auth".
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
