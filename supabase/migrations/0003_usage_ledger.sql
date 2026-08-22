-- Metering for AI analysis, and the table every later business question reads.
--
-- One append-only row per analysis ATTEMPT — successes and refusals alike,
-- because "how many people hit the trial wall and then stopped" is only
-- answerable if the refusals were recorded too.
--
-- Written exclusively by the edge function under the service role. Users may
-- read their own rows (that is what powers "3 of 10 free analyses left");
-- nobody may update or delete, same rule as every other table here (D4).

create table if not exists public.usage (
  id          text        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- The user's local day, supplied by the client, so daily caps mean what the
  -- user thinks they mean rather than following UTC (D7).
  day         date        not null,

  model       text        not null,
  -- Whose key paid for this call. The distinction the whole feature exists to
  -- make.
  key_source  text        not null
    check (key_source in ('MASTER_TRIAL', 'MASTER_PLAN', 'USER_KEY')),

  -- As reported by the provider, not estimated: reasoning tokens are invisible
  -- until they are counted, so cost is measured rather than modelled.
  input_tokens   integer,
  output_tokens  integer,
  cost_micros    bigint,

  outcome     text        not null
    check (outcome in ('OK', 'REFUSED_QUOTA', 'REFUSED_NO_KEY', 'PROVIDER_ERROR', 'UNREADABLE'))
);

create index if not exists usage_user_created_idx on public.usage (user_id, created_at desc);
create index if not exists usage_user_day_idx     on public.usage (user_id, day);
create index if not exists usage_created_idx      on public.usage (created_at desc);

revoke all on public.usage from anon, authenticated;
grant select on public.usage to authenticated;

alter table public.usage enable row level security;

drop policy if exists usage_select_own on public.usage;
create policy usage_select_own on public.usage
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- admins ----
-- Populated by hand in the dashboard. No self-service, and no role column on
-- profiles that a bug could flip.
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  added_at   timestamptz not null default now(),
  note       text
);

revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;

alter table public.app_admins enable row level security;

drop policy if exists app_admins_select_self on public.app_admins;
create policy app_admins_select_self on public.app_admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

-- D19: admins see METADATA, never health data.
--
-- This policy is the entire admin grant on usage. The health tables —
-- meals, observations, sleep, workouts, goals, inferences — deliberately
-- never receive one, so an admin reading somebody's food is not "against
-- policy": it returns zero rows. A promise the database keeps is worth more
-- than one an operator remembers to keep.
drop policy if exists usage_select_admin on public.usage;
create policy usage_select_admin on public.usage
  for select to authenticated using (public.is_admin());
