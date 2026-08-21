-- Proves the database enforces what the architecture claims, independent of
-- any client. Run against the shim (see 00_local_auth_shim.sql) or a real
-- Supabase instance.
\set ON_ERROR_STOP on

\echo '== setup: two users =='
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;

-- Alice writes a meal and an observation.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.meals (record_id, meal_id, version, user_id, day, data)
values ('rec-1', 'lunch', 1, '11111111-1111-1111-1111-111111111111', '2026-08-21', '{"slot":"LUNCH"}');

insert into public.observations (id, user_id, day, code, data)
values ('obs-1', '11111111-1111-1111-1111-111111111111', '2026-08-21', 'WEIGHT', '{"value":72800}');

\echo '== D4: history cannot be rewritten =='
do $$
begin
  update public.meals set version = 99 where record_id = 'rec-1';
  raise exception 'FAIL: UPDATE on meals was permitted';
exception
  when insufficient_privilege then raise notice 'PASS: UPDATE refused';
end
$$;

do $$
begin
  delete from public.meals where record_id = 'rec-1';
  raise exception 'FAIL: DELETE on meals was permitted';
exception
  when insufficient_privilege then raise notice 'PASS: DELETE refused';
end
$$;

\echo '== D15: two devices cannot both claim a version =='
do $$
begin
  insert into public.meals (record_id, meal_id, version, user_id, day, data)
  values ('rec-2', 'lunch', 1, '11111111-1111-1111-1111-111111111111', '2026-08-21', '{"slot":"DINNER"}');
  raise exception 'FAIL: duplicate (meal_id, version) was permitted';
exception
  when unique_violation then raise notice 'PASS: duplicate version refused (this is the conflict signal)';
end
$$;

-- The legitimate next version is fine.
insert into public.meals (record_id, meal_id, version, user_id, day, data)
values ('rec-3', 'lunch', 2, '11111111-1111-1111-1111-111111111111', '2026-08-21', '{"slot":"LUNCH"}');
\echo 'PASS: version 2 accepted'

\echo '== D16: a user cannot write rows owned by someone else =='
do $$
begin
  insert into public.meals (record_id, meal_id, version, user_id, day, data)
  values ('rec-evil', 'other', 1, '22222222-2222-2222-2222-222222222222', '2026-08-21', '{}');
  raise exception 'FAIL: wrote a row owned by another user';
exception
  when insufficient_privilege then raise notice 'PASS: cross-user insert refused by RLS';
end
$$;

\echo '== D16: family members cannot see each other =='
-- Bob writes his own meal...
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.meals (record_id, meal_id, version, user_id, day, data)
values ('bob-1', 'bob-lunch', 1, '22222222-2222-2222-2222-222222222222', '2026-08-21', '{"slot":"LUNCH"}');

-- ...and sees only it.
select case
  when count(*) = 1 and min(record_id) = 'bob-1'
    then 'PASS: Bob sees only his own row'
  else 'FAIL: Bob sees ' || count(*) || ' rows'
end as result
from public.meals;

-- Alice still sees her two, and none of Bob's.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select case
  when count(*) = 2 and count(*) filter (where user_id <> auth.uid()) = 0
    then 'PASS: Alice sees only her own rows'
  else 'FAIL: Alice sees ' || count(*) || ' rows'
end as result
from public.meals;

\echo '== observations obey the same rules =='
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select case when count(*) = 0 then 'PASS: no cross-user observations' else 'FAIL' end
from public.observations;

reset role;
