-- Admins analyse on their own key, without a quota.
--
-- The owner should not have to burn a trial or paste a key into Settings to
-- use their own app. Recording it as its own key_source keeps the analytics
-- honest: owner usage must not inflate "what the trial costs me", which is the
-- number that decides whether any of this is worth continuing.
alter table public.usage drop constraint if exists usage_key_source_check;
alter table public.usage add constraint usage_key_source_check
  check (key_source in ('MASTER_TRIAL', 'MASTER_PLAN', 'MASTER_ADMIN', 'USER_KEY'));
