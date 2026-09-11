-- A claim that comes back after its slot was given away.
--
-- `reservation_grace` stops a stranded claim blocking an allowance for ever,
-- but expiring a reservation does not cancel the provider request that is
-- still running. So this sequence was possible:
--
--   1. A claims the last slot. The function dies; the row stays RESERVED.
--   2. Five minutes pass. The row stops counting.
--   3. B claims the freed slot and settles it to OK.
--   4. A's request, still alive somewhere, finally returns and settles too.
--
-- Both rows end as OK and the allowance is exceeded by one. `settle_analysis`
-- checked only that the row was still RESERVED, and it was.
--
-- The fix is to notice the row is past its grace and settle it to an outcome
-- that is NOT counted. The work really happened and really cost money, so the
-- cost is kept and still counts against the day's ceiling — but the slot was
-- already spent by somebody else and must not be spent twice.

alter table public.usage drop constraint if exists usage_outcome_check;
alter table public.usage add constraint usage_outcome_check
  check (outcome in (
    'OK', 'OK_FOLLOWUP', 'RESERVED', 'SETTLED_LATE',
    'REFUSED_QUOTA', 'REFUSED_BUDGET', 'REFUSED_NO_KEY',
    'PROVIDER_ERROR', 'UNREADABLE'
  ));

comment on constraint usage_outcome_check on public.usage is
  'SETTLED_LATE: the analysis succeeded but its claim had already expired and been retaken. Costs money, does not consume an allowance.';

-- The return type changes from void to the outcome actually written, so the
-- caller can tell a normal settlement from a late one. Postgres will not
-- replace a function's return type in place.
drop function if exists public.settle_analysis(text, text, text, integer, integer, bigint);

create function public.settle_analysis(
  p_id            text,
  p_model         text,
  p_outcome       text,
  p_input_tokens  integer default null,
  p_output_tokens integer default null,
  p_cost_micros   bigint  default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created timestamptz;
  v_final   text;
begin
  /*
    Locked for update, so two settlements of the same claim cannot interleave.

    Idempotent by the `outcome = 'RESERVED'` filter: a duplicate settle finds
    nothing to lock, returns null, and changes neither the cost nor the
    outcome. The same is true of a release arriving after a settlement.
  */
  select created_at into v_created
  from public.usage
  where id = p_id and outcome = 'RESERVED'
  for update;

  if not found then
    return null;
  end if;

  -- Past its grace, the slot has already been given to somebody else.
  v_final := case
    when v_created <= now() - public.reservation_grace() and p_outcome in ('OK', 'OK_FOLLOWUP')
      then 'SETTLED_LATE'
    else p_outcome
  end;

  update public.usage
     set model = p_model,
         outcome = v_final,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         cost_micros = p_cost_micros
   where id = p_id;

  return v_final;
end
$$;

revoke all on function public.settle_analysis(text, text, text, integer, integer, bigint) from public, anon, authenticated;
