-- What is missing, by name.
--
-- On 25 Sep 2026 `estimate-food` was deployed calling `reserve_analysis`
-- before migrations 0011 and 0012 had been applied. Every analysis failed
-- closed with `ledger_unavailable` for a week, and nothing reported it.
--
-- This lets the `health` function ask the database directly. The expected
-- list is passed in rather than written here, so it lives in the repository
-- next to the code that needs it (supabase/functions/_shared/schema.ts) and a
-- test keeps the two in step. The answer is names only — no data.

create or replace function public.health_missing(
  p_functions text[],
  p_tables    text[],
  p_outcomes  text[]
) returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(item order by item), '{}')
  from (
    select 'function ' || f
      from unnest(p_functions) as f
     where not exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = f)
    union all
    select 'table ' || t
      from unnest(p_tables) as t
     where to_regclass('public.' || quote_ident(t)) is null
    union all
    select 'outcome ' || o
      from unnest(p_outcomes) as o
     where not exists (
       select 1 from pg_constraint c
        where c.conname = 'usage_outcome_check'
          and pg_get_constraintdef(c.oid) like '%''' || o || '''%')
  ) as missing(item)
$$;

-- The service role only. What the schema lacks is not for the public.
revoke all on function public.health_missing(text[], text[], text[]) from public, anon, authenticated;
