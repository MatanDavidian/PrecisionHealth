-- A conversation about one meal costs one analysis.
--
-- The model may ask a single clarifying question — was that grilled or fried —
-- and the answer is worth more than a better model would have been. But a user
-- who answers two questions about their breakfast must not find they have used
-- three of their ten free photos, or nobody will ever answer one.
--
-- So follow-ups are recorded with their own outcome. Both trial counters — the
-- edge function's and the client's readTrialStatus — already filter on
-- outcome = 'OK', so 'OK_FOLLOWUP' rows are metered, costed and auditable
-- without counting against the allowance, and NEITHER COUNT QUERY CHANGES.
--
-- conversation_id is what makes that safe to trust: the server counts prior
-- rows for the same conversation rather than believing a client that says
-- "this one is free". A follow-up with no conversation behind it, or one past
-- the cap, is charged as a fresh analysis.
alter table public.usage add column if not exists conversation_id text;

alter table public.usage drop constraint if exists usage_outcome_check;
alter table public.usage add constraint usage_outcome_check
  check (outcome in (
    'OK', 'OK_FOLLOWUP', 'REFUSED_QUOTA', 'REFUSED_NO_KEY', 'PROVIDER_ERROR', 'UNREADABLE'
  ));

-- The lookup the edge function does on every follow-up: how much of this
-- conversation has already happened?
create index if not exists usage_conversation_idx
  on public.usage (user_id, conversation_id)
  where conversation_id is not null;
