-- Analytics as SQL, read in the Supabase dashboard.
--
-- Deliberately not an in-app admin screen yet: these answer every question
-- worth asking today, cost a few minutes, and need no route, no UI and no auth
-- work. Build a screen once reading these becomes annoying — designing one
-- now would invent requirements before knowing which numbers get looked at.
--
-- security_invoker means each view runs as the caller, so the RLS above still
-- applies: a non-admin selecting from these sees only their own rows.

create or replace view public.admin_daily_cost
with (security_invoker = true) as
select
  day,
  model,
  key_source,
  count(*)                                   as analyses,
  count(*) filter (where outcome = 'OK')     as succeeded,
  count(*) filter (where outcome <> 'OK')    as failed,
  sum(coalesce(cost_micros, 0)) / 1000000.0  as cost_usd
from public.usage
group by day, model, key_source
order by day desc, model;

create or replace view public.admin_user_summary
with (security_invoker = true) as
select
  u.user_id,
  min(u.created_at)                                     as first_seen,
  max(u.created_at)                                     as last_seen,
  count(*)                                              as analyses,
  count(*) filter (where u.key_source = 'MASTER_TRIAL') as trial_analyses,
  count(*) filter (where u.key_source = 'USER_KEY')     as own_key_analyses,
  count(*) filter (where u.outcome = 'REFUSED_QUOTA')   as hit_the_wall,
  sum(coalesce(u.cost_micros, 0)) / 1000000.0           as cost_usd
from public.usage u
group by u.user_id
order by analyses desc;

-- The number that decides whether any of this is worth continuing.
create or replace view public.admin_funnel
with (security_invoker = true) as
with per_user as (
  select
    user_id,
    count(*) filter (where key_source = 'MASTER_TRIAL' and outcome = 'OK') as trial_used,
    count(*) filter (where outcome = 'REFUSED_QUOTA') > 0                  as exhausted,
    count(*) filter (where key_source = 'USER_KEY')  > 0                   as brought_own_key
  from public.usage
  group by user_id
)
select
  count(*)                                          as users_who_tried,
  count(*) filter (where trial_used >= 1)           as used_at_least_one,
  count(*) filter (where exhausted)                 as exhausted_trial,
  count(*) filter (where brought_own_key)           as brought_own_key,
  count(*) filter (where exhausted and not brought_own_key) as stopped_at_the_wall
from per_user;
