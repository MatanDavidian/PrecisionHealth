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

\echo '== D19: an admin sees usage, never food =='
reset role;

-- Bob is an admin; Alice's meal and her usage row both already exist.
insert into public.app_admins (user_id) values ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;
insert into public.usage (id, user_id, day, model, key_source, outcome)
values ('usage-alice-1', '11111111-1111-1111-1111-111111111111', '2026-08-21',
        'gpt-5.6-sol', 'MASTER_TRIAL', 'OK');

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select case when count(*) = 1
  then 'PASS: admin sees another user''s usage row'
  else 'FAIL: admin sees ' || count(*) || ' usage rows' end
from public.usage where user_id = '11111111-1111-1111-1111-111111111111';

-- The point of D19: no admin policy exists on the health tables, so this is
-- not "denied" — there is simply nothing to return.
select case when count(*) = 0
  then 'PASS: admin sees NO meals belonging to another user'
  else 'FAIL: admin can read ' || count(*) || ' of another user''s meals' end
from public.meals where user_id = '11111111-1111-1111-1111-111111111111';

select case when count(*) = 0
  then 'PASS: admin sees NO observations belonging to another user'
  else 'FAIL: admin can read ' || count(*) || ' of another user''s observations' end
from public.observations where user_id = '11111111-1111-1111-1111-111111111111';

\echo '== the ledger is append-only too =='
do $$
begin
  update public.usage set outcome = 'OK' where id = 'usage-alice-1';
  raise exception 'FAIL: UPDATE on usage was permitted';
exception
  when insufficient_privilege then raise notice 'PASS: usage cannot be rewritten';
end
$$;

-- A plain user must not see anyone else's metering.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select case when count(*) = 1 then 'PASS: user sees only their own usage'
  else 'FAIL: user sees ' || count(*) || ' usage rows' end
from public.usage;

reset role;

\echo '== a conversation costs one analysis =='
set role postgres;

-- One photo, then two answers about it. The photo counts; the answers do not.
insert into public.usage (id, user_id, day, model, key_source, outcome, conversation_id)
values ('conv-1-initial', '11111111-1111-1111-1111-111111111111', '2026-08-22',
        'gpt-5.6-sol', 'MASTER_TRIAL', 'OK',          'conv-1'),
       ('conv-1-follow-a', '11111111-1111-1111-1111-111111111111', '2026-08-22',
        'gpt-5.6-sol', 'MASTER_TRIAL', 'OK_FOLLOWUP', 'conv-1'),
       ('conv-1-follow-b', '11111111-1111-1111-1111-111111111111', '2026-08-22',
        'gpt-5.6-sol', 'MASTER_TRIAL', 'OK_FOLLOWUP', 'conv-1');

-- This is the query BOTH trial counters run, unchanged by the feature.
select case when count(*) = 2
  then 'PASS: three calls about two meals count as two analyses'
  else 'FAIL: trial counted ' || count(*) || ' analyses, expected 2' end
from public.usage
where user_id = '11111111-1111-1111-1111-111111111111'
  and key_source = 'MASTER_TRIAL' and outcome = 'OK';

-- ...while every round is still metered, costed and auditable.
select case when count(*) = 3
  then 'PASS: all three rounds are still on the ledger'
  else 'FAIL: ledger holds ' || count(*) || ' rounds, expected 3' end
from public.usage where conversation_id = 'conv-1';

-- The cap the edge function enforces is a count over this index.
select case when count(*) = 2
  then 'PASS: follow-ups on a conversation are countable'
  else 'FAIL: counted ' || count(*) || ' follow-ups, expected 2' end
from public.usage where conversation_id = 'conv-1' and outcome = 'OK_FOLLOWUP';

do $$
begin
  insert into public.usage (id, user_id, day, model, key_source, outcome)
  values ('bad-outcome', '11111111-1111-1111-1111-111111111111', '2026-08-22',
          'gpt-5.6-sol', 'MASTER_TRIAL', 'DEFINITELY_NOT_AN_OUTCOME');
  raise exception 'FAIL: an unknown outcome was accepted';
exception
  when check_violation then raise notice 'PASS: outcome is still constrained';
end
$$;

reset role;

\echo '== a language preference belongs to the person =='
set role postgres;

insert into public.user_preferences (user_id, language)
values ('11111111-1111-1111-1111-111111111111', 'he');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select case when count(*) = 1 then 'PASS: a user reads their own preference'
  else 'FAIL: read ' || count(*) || ' rows' end
from public.user_preferences;

-- Unlike every health table, this one may be rewritten: a preference is
-- current state, not a record of something that happened.
do $$
begin
  update public.user_preferences set language = 'en'
  where user_id = '11111111-1111-1111-1111-111111111111';
  raise notice 'PASS: a preference can be changed';
exception
  when insufficient_privilege then raise exception 'FAIL: UPDATE on preferences was refused';
end
$$;

-- ...but only your own, and only to a language that exists.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select case when count(*) = 0 then 'PASS: nobody reads another user''s preference'
  else 'FAIL: leaked ' || count(*) || ' rows' end
from public.user_preferences
where user_id = '11111111-1111-1111-1111-111111111111';

do $$
begin
  insert into public.user_preferences (user_id, language)
  values ('11111111-1111-1111-1111-111111111111', 'he');
  raise exception 'FAIL: wrote a preference for somebody else';
exception
  when insufficient_privilege then raise notice 'PASS: cross-user preference insert refused';
end
$$;

set role postgres;
do $$
begin
  insert into public.user_preferences (user_id, language)
  values ('22222222-2222-2222-2222-222222222222', 'klingon');
  raise exception 'FAIL: an unknown language was accepted';
exception
  when check_violation then raise notice 'PASS: language is constrained';
end
$$;

reset role;
