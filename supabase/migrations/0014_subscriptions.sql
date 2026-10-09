-- The paid plan: subscriptions from Lemon Squeezy, and a monthly allowance per kind.
--
-- Written only by the `lemonsqueezy-webhook` function (service role). A user
-- can read their own subscription, so the app can show its state, and cannot
-- write one: a row here is what grants paid analyses.

create table if not exists public.subscriptions (
  -- Lemon Squeezy's subscription id.
  id                 text        primary key,
  -- Deleting the account removes the row with everything else. delete-account
  -- cancels the subscription at Lemon Squeezy first, so billing stops too.
  user_id            uuid        not null references auth.users (id) on delete cascade,
  status             text        not null,
  variant_id         text,
  customer_id        text,
  -- The first order. A refund of it arrives as `order_refunded`, which names
  -- the order and not the subscription.
  order_id           text,
  billing_anchor     integer     check (billing_anchor between 1 and 31),
  renews_at          timestamptz,
  ends_at            timestamptz,
  refunded_at        timestamptz,
  last_payment_at    timestamptz,
  test_mode          boolean     not null default false,
  -- Lemon Squeezy's own timestamps. `source_updated_at` orders the events:
  -- one older than what is stored is a late delivery and is not applied.
  source_created_at  timestamptz,
  source_updated_at  timestamptz,
  updated_at         timestamptz not null default now()
);

create index if not exists subscriptions_user_idx  on public.subscriptions (user_id);
create index if not exists subscriptions_order_idx on public.subscriptions (order_id);

revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Every webhook delivery that was processed, by a hash of its body. A
-- redelivery of the same body is recognised and skipped. No user id and no
-- payload: Lemon Squeezy's events carry the customer's name and email, and
-- none of that is needed here.
create table if not exists public.billing_events (
  id           text        primary key,
  event_name   text        not null,
  object_type  text,
  object_id    text,
  test_mode    boolean,
  -- APPLIED, STALE, REFUNDED, UNKNOWN_USER… — what the webhook did with it.
  result       text        not null,
  received_at  timestamptz not null default now()
);

revoke all on public.billing_events from anon, authenticated;
alter table public.billing_events enable row level security;

-- ------------------------------------------------------------ the ledger ----

-- Photos and words are counted separately: 100 and 200 a month on the plan.
-- Rows written before this are photos as far as anyone needs to know; the
-- trial counts both kinds together anyway.
alter table public.usage add column if not exists kind text not null default 'PHOTO';
alter table public.usage drop constraint if exists usage_kind_check;
alter table public.usage add constraint usage_kind_check check (kind in ('PHOTO', 'TEXT'));

drop function if exists public.reserve_analysis(uuid, date, text, text, integer, timestamptz, text);

/**
 * Claims one analysis, or refuses. As 0011, with two changes.
 *
 * `p_kind` is recorded on the claim, and `p_per_kind` counts only that kind
 * against the limit: the plan's 100 photos and 200 written analyses are two
 * allowances, while the trial's ten are one.
 *
 * And only 'OK' counts. 0011 also counted 'OK_FOLLOWUP' — an answered
 * question — although the app promises those are free and its own count of
 * what is left ignores them. Someone who answered two questions was refused
 * two analyses early, with the app still saying they had some.
 */
create function public.reserve_analysis(
  p_user_id       uuid,
  p_day           date,
  p_model         text,
  p_key_source    text,
  p_limit         integer,
  p_period_start  timestamptz default null,
  p_conversation  text default null,
  p_kind          text default 'PHOTO',
  p_per_kind      boolean default false
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_id   text;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(*) into v_used
  from public.usage
  where user_id = p_user_id
    and key_source = p_key_source
    and (p_period_start is null or created_at >= p_period_start)
    and (not p_per_kind or kind = p_kind)
    and (
      outcome = 'OK'
      or (outcome = 'RESERVED' and created_at > now() - public.reservation_grace())
    );

  if v_used >= p_limit then
    return null;
  end if;

  v_id := gen_random_uuid()::text;
  insert into public.usage (id, user_id, day, model, key_source, outcome, conversation_id, kind)
  values (v_id, p_user_id, p_day, p_model, p_key_source, 'RESERVED', p_conversation, p_kind);
  return v_id;
end
$$;

revoke all on function public.reserve_analysis(uuid, date, text, text, integer, timestamptz, text, text, boolean)
  from public, anon, authenticated;

-- The plan's count runs on every paid analysis.
create index if not exists usage_user_source_kind_created_idx
  on public.usage (user_id, key_source, kind, created_at);
