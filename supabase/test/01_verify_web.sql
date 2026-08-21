-- Same checks as 01_verify.sql, but pure SQL — no psql meta-commands — so it
-- can be pasted straight into the Supabase SQL Editor. Returns a table of
-- results; every row should read PASS.
--
-- Safe to run on a live project: it writes only to two throwaway user ids and
-- cleans up after itself.
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  seen  integer;
begin
  create temporary table if not exists verification (check_name text, result text);
  delete from verification;
  -- The checks run as `authenticated`, so that role must be able to record
  -- them. Without this the script fails on its own scratchpad rather than on
  -- anything it is testing.
  grant all on verification to authenticated;

  -- The editor runs as a privileged role that bypasses RLS, so these test
  -- users must exist and we must drop to `authenticated` to test anything real.
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, created_at, updated_at)
  values (alice, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'verify-alice@example.invalid', '', now(), now()),
         (bob,   '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'verify-bob@example.invalid',   '', now(), now())
  on conflict (id) do nothing;

  set local role authenticated;

  -- ---------------------------------------------------------------- Alice --
  perform set_config('request.jwt.claim.sub', alice::text, true);

  insert into public.meals (record_id, meal_id, version, user_id, day, data)
  values ('verify-rec-1', 'verify-lunch', 1, alice, current_date, '{"slot":"LUNCH"}');

  -- D4: history cannot be rewritten
  begin
    update public.meals set version = 99 where record_id = 'verify-rec-1';
    insert into verification values ('D4 append-only: UPDATE', 'FAIL — update was permitted');
  exception when insufficient_privilege then
    insert into verification values ('D4 append-only: UPDATE', 'PASS — refused');
  end;

  begin
    delete from public.meals where record_id = 'verify-rec-1';
    insert into verification values ('D4 append-only: DELETE', 'FAIL — delete was permitted');
  exception when insufficient_privilege then
    insert into verification values ('D4 append-only: DELETE', 'PASS — refused');
  end;

  -- D15: two devices cannot both claim one version
  begin
    insert into public.meals (record_id, meal_id, version, user_id, day, data)
    values ('verify-rec-2', 'verify-lunch', 1, alice, current_date, '{"slot":"DINNER"}');
    insert into verification values ('D15 duplicate version', 'FAIL — duplicate permitted');
  exception when unique_violation then
    insert into verification values ('D15 duplicate version', 'PASS — refused (this is the conflict signal)');
  end;

  insert into public.meals (record_id, meal_id, version, user_id, day, data)
  values ('verify-rec-3', 'verify-lunch', 2, alice, current_date, '{"slot":"LUNCH"}');
  insert into verification values ('D15 next version', 'PASS — accepted');

  -- D16: cannot write rows owned by someone else
  begin
    insert into public.meals (record_id, meal_id, version, user_id, day, data)
    values ('verify-evil', 'verify-other', 1, bob, current_date, '{}');
    insert into verification values ('D16 cross-user INSERT', 'FAIL — wrote another user''s row');
  exception when insufficient_privilege then
    insert into verification values ('D16 cross-user INSERT', 'PASS — refused by RLS');
  end;

  -- ------------------------------------------------------------------ Bob --
  perform set_config('request.jwt.claim.sub', bob::text, true);

  insert into public.meals (record_id, meal_id, version, user_id, day, data)
  values ('verify-bob-1', 'verify-bob-lunch', 1, bob, current_date, '{"slot":"LUNCH"}');

  select count(*) into seen from public.meals where meal_id like 'verify-%';
  insert into verification values (
    'D16 Bob sees only his own',
    case when seen = 1 then 'PASS — 1 row' else 'FAIL — sees ' || seen || ' rows' end);

  -- ---------------------------------------------------------------- Alice --
  perform set_config('request.jwt.claim.sub', alice::text, true);

  select count(*) into seen from public.meals where meal_id like 'verify-%';
  insert into verification values (
    'D16 Alice sees only her own',
    case when seen = 2 then 'PASS — 2 rows' else 'FAIL — sees ' || seen || ' rows' end);

  -- --------------------------------------------------------------- tidy up --
  reset role;
  delete from public.meals where meal_id like 'verify-%';
  delete from auth.users where id in (alice, bob);
end
$$;

select check_name, result from verification order by check_name;
