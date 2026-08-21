-- Isolation and append-only, enforced by the database.

-- ------------------------------------------------------- append-only (D4) --
-- Authenticated users may add and read. They may not rewrite history: a bug in
-- any client — or a hostile one — cannot alter or remove a record. Corrections
-- are new rows that supersede old ones, which is what makes syncing two
-- devices a union rather than a merge.
revoke all on public.meals, public.observations, public.sleep, public.workouts,
              public.goals, public.inferences
  from anon, authenticated;

grant select, insert on public.meals, public.observations, public.sleep,
                        public.workouts, public.goals, public.inferences
  to authenticated;

-- Profiles are current state rather than a log, so they may be updated.
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

-- --------------------------------------------------- row-level security ----
alter table public.meals        enable row level security;
alter table public.observations enable row level security;
alter table public.sleep        enable row level security;
alter table public.workouts     enable row level security;
alter table public.goals        enable row level security;
alter table public.inferences   enable row level security;
alter table public.profiles     enable row level security;

-- One shape, repeated: you see your rows, you write your rows, and the
-- `with check` half stops anyone inserting a row owned by someone else.
--
-- Each policy is dropped first so this migration can be re-run safely — after
-- a partial failure, or when the SQL Editor has already enabled RLS on your
-- behalf. `create policy` has no `if not exists`.
drop policy if exists meals_select on public.meals;
create policy meals_select on public.meals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists meals_insert on public.meals;
create policy meals_insert on public.meals
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists observations_select on public.observations;
create policy observations_select on public.observations
  for select to authenticated using (user_id = auth.uid());
drop policy if exists observations_insert on public.observations;
create policy observations_insert on public.observations
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists sleep_select on public.sleep;
create policy sleep_select on public.sleep
  for select to authenticated using (user_id = auth.uid());
drop policy if exists sleep_insert on public.sleep;
create policy sleep_insert on public.sleep
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists workouts_select on public.workouts;
create policy workouts_select on public.workouts
  for select to authenticated using (user_id = auth.uid());
drop policy if exists workouts_insert on public.workouts;
create policy workouts_insert on public.workouts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists goals_insert on public.goals;
create policy goals_insert on public.goals
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists inferences_select on public.inferences;
create policy inferences_select on public.inferences
  for select to authenticated using (user_id = auth.uid());
drop policy if exists inferences_insert on public.inferences;
create policy inferences_insert on public.inferences
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
