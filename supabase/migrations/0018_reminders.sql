-- Reminders (docs/features/reminders.md): "time to log today" at an hour the
-- person chooses, and "sync your watch" when it has gone quiet.
--
-- What is here:
-- - where to send: one row per device that said yes to notifications
-- - what was sent: one row per person, kind and day, so a reminder goes once
-- - the person's choices, on their existing preferences row
-- - the server's own secrets (the scheduler's token, the push keys), in a
--   schema the API cannot reach
-- - the schedule itself: every 15 minutes, call send-reminders
--
-- Nothing here is health data. A push address identifies a browser, not a
-- person's body; the log says only that a reminder went out.

-- ------------------------------------------------------------ devices ---

create table if not exists public.push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- The push service's address for this browser. Unique: a device belongs to
  -- whoever subscribed it last, so signing in as someone else moves it.
  endpoint    text        not null unique,
  -- The browser's public key and auth secret, which the message is encrypted
  -- to (RFC 8291). Useless without the browser's private key.
  p256dh      text        not null,
  auth        text        not null,
  created_at  timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Written and read only by the server functions, which check who is asking.
revoke all on public.push_subscriptions from anon, authenticated;
alter table public.push_subscriptions enable row level security;

-- ------------------------------------------------------------- sent log ---

create table if not exists public.reminder_log (
  user_id  uuid        not null references auth.users (id) on delete cascade,
  kind     text        not null check (kind in ('MEAL', 'WATCH')),
  -- The day the reminder was about, in the person's own calendar: a 01:00
  -- reminder is about the evening before.
  day      date        not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, day)
);

revoke all on public.reminder_log from anon, authenticated;
alter table public.reminder_log enable row level security;

-- ------------------------------------------------------------- choices ---

alter table public.user_preferences
  add column if not exists meal_reminder  boolean not null default false,
  add column if not exists watch_reminder boolean not null default false,
  -- Quarter hours from 16:00 to 04:00: the evening, and the night after it.
  add column if not exists reminder_time  text    not null default '22:30',
  -- The person's zone when they last chose, kept up to date as they travel.
  add column if not exists reminder_zone  text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_preferences_reminder_time_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_reminder_time_check check (
        reminder_time ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'
        and (reminder_time >= '16:00' or reminder_time <= '04:00')
      );
  end if;
end $$;

-- The existing grants (select, insert, update on the table, own row only)
-- already cover the new columns.

-- ------------------------------------------------------ server secrets ---

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  key    text  primary key,
  value  jsonb not null
);
revoke all on private.settings from public, anon, authenticated;

-- The token the schedule shows send-reminders. Made here, inside the
-- database, so it is never typed, pasted or committed by anyone.
insert into private.settings (key, value)
values (
  'reminders_token',
  to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
)
on conflict (key) do nothing;

-- Whether a caller holds the schedule's token.
create or replace function public.reminders_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.settings
    where key = 'reminders_token' and value #>> '{}' = p_token and length(p_token) >= 32
  )
$$;

-- The push keys (VAPID). Made by the server on first use, and kept for good:
-- a new pair would silently orphan every device already subscribed.
create or replace function public.push_keys()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from private.settings where key = 'vapid'
$$;

-- Stores a pair if none exists yet, and returns whichever pair is stored:
-- two first calls at once agree on one pair.
create or replace function public.push_keys_init(p_keys jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.settings (key, value) values ('vapid', p_keys) on conflict (key) do nothing;
  return (select value from private.settings where key = 'vapid');
end;
$$;

-- Records a reminder about to be sent, unless one of the same kind went out
-- within the last p_gap_days days (1: once a day; 3: the watch, every three).
-- True means "send it"; false means "already done".
create or replace function public.claim_reminder(p_user uuid, p_kind text, p_day date, p_gap_days integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.reminder_log
    where user_id = p_user and kind = p_kind and day > p_day - p_gap_days and day <= p_day
  ) then
    return false;
  end if;
  insert into public.reminder_log (user_id, kind, day) values (p_user, p_kind, p_day)
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.reminders_token_ok(text) from public, anon, authenticated;
revoke all on function public.push_keys() from public, anon, authenticated;
revoke all on function public.push_keys_init(jsonb) from public, anon, authenticated;
revoke all on function public.claim_reminder(uuid, text, date, integer) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reminders_token_ok(text) to service_role;
    grant execute on function public.push_keys() to service_role;
    grant execute on function public.push_keys_init(jsonb) to service_role;
    grant execute on function public.claim_reminder(uuid, text, date, integer) to service_role;
  end if;
end $$;

-- ------------------------------------------------------------ schedule ---
--
-- Every 15 minutes, the database calls send-reminders with the token above.
-- pg_cron and pg_net come with Supabase; a plain Postgres (the test
-- database in CI) has neither, and skips this. If creating the job fails on
-- Supabase, the migration still applies and the warning says so: the rest
-- is harmless without it, and the daily health check reports it missing.
--
-- The address is the production project's, which is public (it is in the
-- app's Content-Security-Policy). Another project would change it here.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      create extension if not exists pg_cron;
      create extension if not exists pg_net;
      perform cron.unschedule(jobid) from cron.job where jobname = 'send-reminders';
      perform cron.schedule(
        'send-reminders',
        '*/15 * * * *',
        $job$
          select net.http_post(
            url := 'https://vdzphvyoqlkcrovtqdlk.supabase.co/functions/v1/send-reminders',
            headers := jsonb_build_object(
              'content-type', 'application/json',
              'x-reminders-token', (select value #>> '{}' from private.settings where key = 'reminders_token')
            ),
            body := '{}'::jsonb
          )
        $job$
      );
    exception when others then
      raise warning 'reminders: the schedule was not created (%). Create it from the Supabase dashboard, Integrations, Cron.', sqlerrm;
    end;
  end if;
end $$;

-- Whether the schedule exists, for the daily health check.
create or replace function public.reminders_scheduled()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    return false;
  end if;
  return exists (select 1 from cron.job where jobname = 'send-reminders' and active);
end;
$$;
revoke all on function public.reminders_scheduled() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reminders_scheduled() to service_role;
  end if;
end $$;
