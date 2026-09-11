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

-- ---------------------------------------------------------------- consents --
-- 0009. The evidence table: append-only by policy, not just by convention.

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.consents (id, user_id, subject, version, action, locale, document_sha)
values ('consent-1', '11111111-1111-1111-1111-111111111111',
        'PRIVACY', '2026-09-04', 'GRANTED', 'he', repeat('a', 64));

select case when count(*) = 1 then 'PASS: a consent is recorded'
  else 'FAIL: recorded ' || count(*) end
from public.consents;

-- Withdrawal is a SECOND row. The first stays, which is the whole design:
-- "what had this person agreed to in March" has to remain answerable.
insert into public.consents (id, user_id, subject, version, action, locale)
values ('consent-2', '11111111-1111-1111-1111-111111111111',
        'PRIVACY', '2026-09-04', 'WITHDRAWN', 'he');

select case when count(*) = 2 then 'PASS: withdrawal is appended, not applied'
  else 'FAIL: history has ' || count(*) || ' rows' end
from public.consents;

-- A consent log its subject can edit proves nothing at all.
do $$
begin
  update public.consents set action = 'GRANTED' where id = 'consent-2';
  raise exception 'FAIL: a consent record was editable';
exception
  when insufficient_privilege then raise notice 'PASS: consents cannot be updated';
end
$$;

do $$
begin
  delete from public.consents where id = 'consent-2';
  raise exception 'FAIL: a consent record was deletable';
exception
  when insufficient_privilege then raise notice 'PASS: consents cannot be deleted';
end
$$;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select case when count(*) = 0 then 'PASS: nobody reads another user''s consents'
  else 'FAIL: leaked ' || count(*) || ' rows' end
from public.consents
where user_id = '11111111-1111-1111-1111-111111111111';

do $$
begin
  insert into public.consents (id, user_id, subject, version, action, locale)
  values ('consent-3', '11111111-1111-1111-1111-111111111111',
          'TERMS', '2026-09-04', 'GRANTED', 'en');
  raise exception 'FAIL: consented on somebody else''s behalf';
exception
  when insufficient_privilege then raise notice 'PASS: cross-user consent refused';
end
$$;

set role postgres;
do $$
begin
  insert into public.consents (id, user_id, subject, version, action, locale)
  values ('consent-4', '22222222-2222-2222-2222-222222222222',
          'MARKETING', '2026-09-04', 'GRANTED', 'en');
  raise exception 'FAIL: an unknown consent subject was accepted';
exception
  when check_violation then raise notice 'PASS: consent subject is constrained';
end
$$;

reset role;

-- ------------------------------------------------------------ spend ceiling --
-- 0010. The ledger has to be able to say WHY someone was turned away, and the
-- budget view has to add up what a day cost.

set role postgres;

do $$
begin
  insert into public.usage (id, user_id, day, model, key_source, outcome)
  values ('usage-budget-1', '11111111-1111-1111-1111-111111111111', current_date,
          'gpt-5.6-sol', 'MASTER_TRIAL', 'REFUSED_BUDGET');
  raise notice 'PASS: a budget refusal can be recorded';
exception
  when check_violation then raise exception 'FAIL: REFUSED_BUDGET was rejected';
end
$$;

-- Turning someone away for the ceiling is a different event from turning them
-- away for their own quota, and the ledger must not conflate them.
insert into public.usage (id, user_id, day, model, key_source, outcome, cost_micros)
values
  ('usage-budget-2', '11111111-1111-1111-1111-111111111111', current_date,
   'gpt-5.6-sol', 'MASTER_TRIAL', 'OK', 250000),
  ('usage-budget-3', '11111111-1111-1111-1111-111111111111', current_date,
   'gpt-5.6-sol', 'MASTER_TRIAL', 'OK_FOLLOWUP', 150000),
  ('usage-budget-4', '22222222-2222-2222-2222-222222222222', current_date,
   'gpt-5.6-terra', 'USER_KEY', 'OK', 9999999);

-- The sum is the assertion. 400000 is the two master-key rows above; the
-- USER_KEY row's 9,999,999 is excluded, which is the whole point — a person
-- spending their own money must never count against the owner's ceiling.
-- Earlier tests in this file share today, so served/refused are >= rather
-- than =.
select case
  when spent_micros = 400000 and refused_for_budget >= 1 and calls_served >= 2
    then 'PASS: the day adds up, and a user''s own key is not counted'
  else 'FAIL: spent=' || spent_micros || ' served=' || calls_served
       || ' refused=' || refused_for_budget
  end
from public.admin_budget
where on_day = current_date;

do $$
begin
  insert into public.usage (id, user_id, day, model, key_source, outcome)
  values ('usage-budget-5', '11111111-1111-1111-1111-111111111111', current_date,
          'gpt-5.6-sol', 'MASTER_TRIAL', 'REFUSED_BECAUSE_MONDAY');
  raise exception 'FAIL: an unknown outcome was accepted';
exception
  when check_violation then raise notice 'PASS: outcome is still constrained';
end
$$;

reset role;

-- ------------------------------------------------------- analysis reservation --
-- 0011. The limit has to hold when two requests arrive together, which is the
-- whole reason this stopped being a count-then-insert.

set role postgres;

-- A fresh user, so earlier tests in this file do not colour the count. The
-- local shim's auth.users carries an id and nothing else.
insert into auth.users (id)
values ('33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

-- Three claims against a limit of three: all granted.
select case when count(*) = 3 then 'PASS: claims are granted up to the limit'
  else 'FAIL: granted ' || count(*) end
from (
  select public.reserve_analysis('33333333-3333-3333-3333-333333333333',
         current_date, 'gpt-5.6-terra', 'MASTER_TRIAL', 3) as id
  from generate_series(1, 3)
) claims
where id is not null;

-- The fourth is refused, because three RESERVED rows already count.
select case when public.reserve_analysis('33333333-3333-3333-3333-333333333333',
       current_date, 'gpt-5.6-terra', 'MASTER_TRIAL', 3) is null
  then 'PASS: an unsettled claim still counts, so the fourth is refused'
  else 'FAIL: the limit was exceeded' end;

-- Releasing one gives the slot back, and records that the attempt happened.
do $$
declare v_id text;
begin
  select id into v_id from public.usage
   where user_id = '33333333-3333-3333-3333-333333333333' and outcome = 'RESERVED' limit 1;
  perform public.release_analysis(v_id);
  if (select outcome from public.usage where id = v_id) <> 'PROVIDER_ERROR' then
    raise exception 'FAIL: a released claim was not recorded';
  end if;
  raise notice 'PASS: a released claim returns the slot and stays on the ledger';
end
$$;

select case when public.reserve_analysis('33333333-3333-3333-3333-333333333333',
       current_date, 'gpt-5.6-terra', 'MASTER_TRIAL', 3) is not null
  then 'PASS: the returned slot can be claimed again'
  else 'FAIL: releasing did not free the slot' end;

-- Settling stamps the real cost, and a settled row keeps counting.
do $$
declare v_id text;
begin
  select id into v_id from public.usage
   where user_id = '33333333-3333-3333-3333-333333333333' and outcome = 'RESERVED' limit 1;
  perform public.settle_analysis(v_id, 'gpt-5.6-terra', 'OK', 1776, 3398, 110800);
  if (select cost_micros from public.usage where id = v_id) <> 110800 then
    raise exception 'FAIL: settling did not record the cost';
  end if;
  raise notice 'PASS: settling records the measured cost';
end
$$;

-- A stranded claim stops counting once it is older than the grace period, so a
-- crashed function cannot silently eat someone's allowance for ever.
update public.usage set created_at = now() - interval '10 minutes'
 where user_id = '33333333-3333-3333-3333-333333333333' and outcome = 'RESERVED';

select case when public.reserve_analysis('33333333-3333-3333-3333-333333333333',
       current_date, 'gpt-5.6-terra', 'MASTER_TRIAL', 3) is not null
  then 'PASS: a stranded claim expires rather than blocking for ever'
  else 'FAIL: a crashed request consumed an allowance permanently' end;

-- A period start is what makes the same function serve a monthly allowance.
select case when public.reserve_analysis('33333333-3333-3333-3333-333333333333',
       current_date, 'gpt-5.6-terra', 'MASTER_TRIAL', 1,
       date_trunc('month', now() + interval '1 month')) is not null
  then 'PASS: a period start counts only that period'
  else 'FAIL: the period was ignored' end;

-- The client must never be able to grant itself analyses.
set role authenticated;
do $$
begin
  perform public.reserve_analysis('33333333-3333-3333-3333-333333333333',
          current_date, 'gpt-5.6-sol', 'MASTER_TRIAL', 999);
  raise exception 'FAIL: a signed-in user could reserve their own analyses';
exception
  when insufficient_privilege then raise notice 'PASS: reserving is service-role only';
end
$$;

reset role;

-- A claim that comes back after its slot was retaken must not be counted twice.
set role postgres;

do $$
declare v_id text; v_result text;
begin
  insert into auth.users (id) values ('55555555-5555-5555-5555-555555555555')
    on conflict (id) do nothing;

  v_id := public.reserve_analysis('55555555-5555-5555-5555-555555555555',
          current_date, 'gpt-5.6-sol', 'MASTER_TRIAL', 1);

  -- It strands, expires, and somebody else takes the slot.
  update public.usage set created_at = now() - interval '10 minutes' where id = v_id;
  perform public.settle_analysis(
    public.reserve_analysis('55555555-5555-5555-5555-555555555555',
      current_date, 'gpt-5.6-sol', 'MASTER_TRIAL', 1),
    'gpt-5.6-sol', 'OK', 1776, 3398, 110800);

  -- Now the original finally returns.
  v_result := public.settle_analysis(v_id, 'gpt-5.6-sol', 'OK', 1776, 3398, 110800);

  if v_result <> 'SETTLED_LATE' then
    raise exception 'FAIL: a late claim settled as % and exceeded the allowance', v_result;
  end if;
  raise notice 'PASS: a late claim keeps its cost but does not spend a second slot';
end
$$;

-- With a limit of 1 and both rows settled, exactly one may count.
select case when count(*) = 1 then 'PASS: the allowance held despite the late arrival'
  else 'FAIL: ' || count(*) || ' analyses counted against a limit of 1' end
from public.usage
where user_id = '55555555-5555-5555-5555-555555555555' and outcome in ('OK','OK_FOLLOWUP');

-- The late row still carries what it cost, because the money was really spent.
select case when cost_micros = 110800 then 'PASS: a late claim still counts against the day''s spend'
  else 'FAIL: the cost of a late claim was lost' end
from public.usage
where user_id = '55555555-5555-5555-5555-555555555555' and outcome = 'SETTLED_LATE';

-- Settling twice, and releasing after settling, must both be no-ops.
do $$
declare v_id text; v_again text;
begin
  insert into auth.users (id) values ('66666666-6666-6666-6666-666666666666')
    on conflict (id) do nothing;
  v_id := public.reserve_analysis('66666666-6666-6666-6666-666666666666',
          current_date, 'gpt-5.6-terra', 'MASTER_TRIAL', 5);
  perform public.settle_analysis(v_id, 'gpt-5.6-terra', 'OK', 100, 200, 5000);

  v_again := public.settle_analysis(v_id, 'gpt-5.6-terra', 'OK', 999, 999, 999999);
  if v_again is not null then raise exception 'FAIL: a duplicate settlement was applied'; end if;

  perform public.release_analysis(v_id);
  if (select outcome from public.usage where id = v_id) <> 'OK'
     or (select cost_micros from public.usage where id = v_id) <> 5000 then
    raise exception 'FAIL: a late release undid a settled analysis';
  end if;
  raise notice 'PASS: settling twice and releasing after settling are both no-ops';
end
$$;

reset role;
