-- What breaks in people's browsers, so it can be fixed without being reported.
--
-- One row per distinct error per day, with a count: a crash loop on a
-- thousand phones is one row saying 1000, not a thousand rows. No user id and
-- no health data — the `report-error` function scrubs the message and stack
-- before they get here — so nothing in this table identifies anyone.

create table if not exists public.client_errors (
  day          date        not null,
  -- sha256 of the kind, the message with numbers blanked, and the top frame.
  fingerprint  text        not null,
  count        integer     not null default 1,
  kind         text        not null check (kind in ('error', 'rejection', 'render')),
  message      text        not null,
  stack        text,
  -- The path only. The query string can hold a date, and nothing else is needed.
  route        text,
  version      text,
  browser      text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  primary key (day, fingerprint)
);

revoke all on public.client_errors from anon, authenticated;
alter table public.client_errors enable row level security;

/**
 * Records one occurrence. False when the day is full.
 *
 * The endpoint is public (signed-out visitors break things too), so what one
 * day may hold is bounded here: 500 distinct errors, each counted. A flood
 * stops being recorded; the app is unaffected. Ninety days are kept.
 */
create or replace function public.record_client_error(
  p_fingerprint text,
  p_kind        text,
  p_message     text,
  p_stack       text,
  p_route       text,
  p_version     text,
  p_browser     text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if not exists (select 1 from public.client_errors where day = v_today and fingerprint = p_fingerprint)
     and (select count(*) from public.client_errors where day = v_today) >= 500 then
    return false;
  end if;

  insert into public.client_errors (day, fingerprint, kind, message, stack, route, version, browser)
  values (v_today, p_fingerprint, p_kind, left(p_message, 500), left(p_stack, 4000),
          left(p_route, 200), left(p_version, 64), left(p_browser, 200))
  on conflict (day, fingerprint) do update
    set count = public.client_errors.count + 1, last_seen = now();

  delete from public.client_errors where day < v_today - 90;
  return true;
end
$$;

revoke all on function public.record_client_error(text, text, text, text, text, text, text)
  from public, anon, authenticated;
