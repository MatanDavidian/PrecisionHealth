-- What the person said about a day's log (docs/features/meal-suggestions-precision.md §4.6).
--
-- "I logged everything", "I didn't log everything", "I skipped lunch": small
-- answers that decide which days the suggestion card counts. Append-only like
-- the other logs (D4): an answer is a new row, the latest for a day wins, and
-- taking one back is a row saying UNSET. So: select and insert, never update
-- or delete; the account's deletion removes them with the user.

create table if not exists public.day_checks (
  id          text        primary key check (length(id) between 1 and 64),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  -- The answer itself, as the app wrote it. Bounded: an answer is a word or
  -- two, never a document.
  data        jsonb       not null check (pg_column_size(data) <= 1024),
  created_at  timestamptz not null default now()
);
create index if not exists day_checks_user_day_idx on public.day_checks (user_id, day);

revoke all on public.day_checks from anon, authenticated;
grant select, insert on public.day_checks to authenticated;

alter table public.day_checks enable row level security;

drop policy if exists day_checks_select on public.day_checks;
create policy day_checks_select on public.day_checks
  for select to authenticated using (user_id = auth.uid());
drop policy if exists day_checks_insert on public.day_checks;
create policy day_checks_insert on public.day_checks
  for insert to authenticated with check (user_id = auth.uid());
