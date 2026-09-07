-- A ceiling on what a day can cost, and a way to see it.
--
-- S5.7. The trial caps analyses PER USER at ten, which bounds what one person
-- costs and bounds nothing at all in total: sign-up is open, so the owner's
-- OpenAI key is exposed to (number of accounts × ten) analyses with no upper
-- limit anywhere. That is the one failure in this system that costs real
-- money, and until now nothing stopped it.
--
-- The ceiling is enforced in the edge function against measured spend, not
-- against a call count. `cost_micros` is already written per call from the
-- provider's own token report, so the number being compared is money rather
-- than a model of it.

-- A refusal for budget is not the same event as a refusal for quota, and
-- conflating them would make the ledger unable to answer "did we turn people
-- away because the service was capped, or because they had used their ten?"
alter table public.usage drop constraint if exists usage_outcome_check;
alter table public.usage add constraint usage_outcome_check
  check (outcome in (
    'OK', 'OK_FOLLOWUP', 'REFUSED_QUOTA', 'REFUSED_BUDGET',
    'REFUSED_NO_KEY', 'PROVIDER_ERROR', 'UNREADABLE'
  ));

-- Spend per day on keys the owner pays for, with the refusals beside it.
--
-- Deliberately not a per-user view (D19): this answers "what did today cost
-- and did we hit the ceiling", which is a metering question. Nobody's food
-- appears in it.
create or replace view public.admin_budget
with (security_invoker = true) as
select
  date_trunc('day', created_at)::date            as on_day,
  sum(coalesce(cost_micros, 0))                  as spent_micros,
  round(sum(coalesce(cost_micros, 0)) / 1000000.0, 4) as spent_usd,
  count(*) filter (where outcome in ('OK', 'OK_FOLLOWUP'))  as calls_served,
  count(*) filter (where outcome = 'REFUSED_BUDGET')        as refused_for_budget,
  count(*) filter (where outcome = 'REFUSED_QUOTA')         as refused_for_quota,
  count(distinct user_id)                        as people
from public.usage
where key_source in ('MASTER_TRIAL', 'MASTER_PLAN', 'MASTER_ADMIN')
group by 1
order by 1 desc;

comment on view public.admin_budget is
  'Daily spend on the owner-funded keys, and whether the ceiling turned anyone away.';

-- Summing a day's spend on every analysis request makes this index the
-- difference between a constant-time check and a table scan that grows.
create index if not exists usage_master_created_idx
  on public.usage (created_at)
  where key_source in ('MASTER_TRIAL', 'MASTER_PLAN', 'MASTER_ADMIN');
