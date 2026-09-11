-- Claiming an analysis before spending one.
--
-- The trial's check was read-then-act: count the rows, compare to the limit,
-- then call the model and insert. Two requests arriving together both read
-- nine, both pass, and both spend — so the limit was a strong suggestion, not
-- a limit. As a trial rounding error that is tolerable. As the thing standing
-- between a paid allowance and an unbounded bill it is not, which is why this
-- has to exist before billing rather than after.
--
-- The fix is to make claiming a slot a single atomic act, serialised per user
-- by an advisory lock held for the transaction. Two concurrent callers queue;
-- the second sees the first's row and is refused.

alter table public.usage drop constraint if exists usage_outcome_check;
alter table public.usage add constraint usage_outcome_check
  check (outcome in (
    'OK', 'OK_FOLLOWUP', 'RESERVED',
    'REFUSED_QUOTA', 'REFUSED_BUDGET', 'REFUSED_NO_KEY',
    'PROVIDER_ERROR', 'UNREADABLE'
  ));

/*
  How long a claim survives without being settled.

  A reservation is turned into OK or released the moment the model answers. If
  the function dies in between — a crash, a timeout, a deploy mid-flight — the
  row would otherwise sit there consuming an allowance nobody used. Counting
  only recent reservations makes that self-healing: a stranded claim stops
  counting after this long, without a sweeper process to write and forget.

  Longer than the slowest analysis (sol measured at 45 seconds) by enough to be
  safe, short enough that a crash is not felt.
*/
create or replace function public.reservation_grace() returns interval
  language sql immutable as $$ select interval '5 minutes' $$;

/**
 * Claims one analysis, or refuses.
 *
 * Returns the new row's id on success, or null when the allowance is spent.
 * The caller MUST settle it afterwards — `settle_analysis` on success, or
 * `release_analysis` when the provider failed, because a person should not
 * lose an analysis to someone else's outage.
 *
 * `p_period_start` is what makes this serve both shapes: null counts the
 * account's whole life, which is the trial, and a timestamp counts from there,
 * which is a monthly allowance. No second function, and no second bug.
 */
create or replace function public.reserve_analysis(
  p_user_id       uuid,
  p_day           date,
  p_model         text,
  p_key_source    text,
  p_limit         integer,
  p_period_start  timestamptz default null,
  p_conversation  text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_id   text;
begin
  /*
    Serialised per user, for the length of this transaction.

    An advisory lock rather than a table lock: it costs nothing, it is released
    automatically on commit or rollback (so a crashed transaction cannot wedge
    an account), and it only ever contends with the same user's own concurrent
    requests — which is exactly the race being closed.
  */
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(*) into v_used
  from public.usage
  where user_id = p_user_id
    and key_source = p_key_source
    and (p_period_start is null or created_at >= p_period_start)
    and (
      outcome in ('OK', 'OK_FOLLOWUP')
      -- A claim still in flight counts; a stranded one stops counting.
      or (outcome = 'RESERVED' and created_at > now() - public.reservation_grace())
    );

  if v_used >= p_limit then
    return null;
  end if;

  v_id := gen_random_uuid()::text;
  insert into public.usage (id, user_id, day, model, key_source, outcome, conversation_id)
  values (v_id, p_user_id, p_day, p_model, p_key_source, 'RESERVED', p_conversation);
  return v_id;
end
$$;

/** Turns a claim into a spent analysis, with what it actually cost. */
create or replace function public.settle_analysis(
  p_id            text,
  p_model         text,
  p_outcome       text,
  p_input_tokens  integer default null,
  p_output_tokens integer default null,
  p_cost_micros   bigint  default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.usage
     set model = p_model,
         outcome = p_outcome,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         cost_micros = p_cost_micros
   where id = p_id and outcome = 'RESERVED';
$$;

/**
 * Gives a claim back.
 *
 * Recorded rather than deleted: the attempt happened, it cost latency, and a
 * ledger that erases its failures cannot answer "how often does the provider
 * fail us". PROVIDER_ERROR is outside the counted outcomes, so the slot is
 * genuinely returned.
 */
create or replace function public.release_analysis(p_id text, p_outcome text default 'PROVIDER_ERROR')
returns void
language sql
security definer
set search_path = public
as $$
  update public.usage set outcome = p_outcome
   where id = p_id and outcome = 'RESERVED';
$$;

-- Only the service role calls these. A client that could reserve its own
-- analyses could reserve a hundred.
revoke all on function public.reserve_analysis(uuid, date, text, text, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.settle_analysis(text, text, text, integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.release_analysis(text, text) from public, anon, authenticated;

-- The count above runs on every analysis; this is what keeps it constant-time.
create index if not exists usage_user_source_created_idx
  on public.usage (user_id, key_source, created_at);
