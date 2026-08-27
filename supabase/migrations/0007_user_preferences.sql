-- Preferences that belong to the person, not to the browser they happen to be
-- using.
--
-- Language is the first of them. Someone who reads Hebrew reads Hebrew on
-- their phone and on their laptop, and having to find the setting again on
-- every device is the kind of small insult that makes an app feel unfinished.
--
-- WHY THIS TABLE IS NOT APPEND-ONLY. D4 governs health records: things that
-- happened, which may never be rewritten because the history is the point. A
-- preference is not a record of anything — it is current state, and its
-- history is worth nothing. So this table takes UPDATE, and it is the only
-- one that does. Keeping D4's grant here would mean a growing pile of
-- superseded language choices to fold every time a screen renders.
--
-- The API key is deliberately NOT here and never will be (D14, Q8). It stays
-- on the device. The rule this table bends is about append-only, not about
-- what may leave the browser.
create table if not exists public.user_preferences (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  -- Null means "never chosen", which is what makes the app ask. An unset
  -- preference and a preference set to the default are different states.
  language    text        check (language in ('en', 'he')),
  updated_at  timestamptz not null default now()
);

revoke all on public.user_preferences from anon, authenticated;
grant select, insert, update on public.user_preferences to authenticated;

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
  for select to authenticated using (user_id = auth.uid());

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No admin policy, deliberately (D19). An admin sees metering, never anything
-- about a person — and what language someone reads in is about the person.
