-- Slice 3, step 1 — schema, isolation and the invariants the database enforces.
--
-- Three architectural decisions are expressed here as database rules rather
-- than as client conventions, because a convention only holds while every
-- client behaves:
--
--   D4  append-only    -> tables grant INSERT and SELECT. No UPDATE, no DELETE.
--   D15 meal versioning -> unique (meal_id, version) makes the second device
--                          writing a version FAIL rather than silently win.
--   D16 isolation       -> row-level security scopes every row to its owner.
--
-- Payloads are stored as jsonb exactly as the client built them (the same
-- envelope idea as the IndexedDB rows), with only the columns that need
-- indexing or constraining lifted out. Generated columns and views can be
-- added over the jsonb later, per metric, when an analytics query actually
-- needs them — normalising everything now would freeze the domain model at its
-- least-proven moment.

-- ---------------------------------------------------------------- meals ----
-- One row per VERSION of a meal. `meal_id` is the meal a person points at;
-- `record_id` is this version of it.
create table if not exists public.meals (
  record_id   text primary key,
  meal_id     text        not null,
  version     integer     not null check (version >= 1),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now(),

  -- D15: the database is the conflict detector. Two devices editing the same
  -- base both try to write (meal_id, version + 1); the second gets a unique
  -- violation, which the client turns into the conflict card rather than an
  -- error. No clocks, no merge daemon.
  constraint meals_one_record_per_version unique (meal_id, version)
);

create index if not exists meals_user_day_idx on public.meals (user_id, day);
create index if not exists meals_meal_idx     on public.meals (meal_id);

-- --------------------------------------------------------- observations ----
-- Every scalar fact (D10): weight, HRV, steps, lab analytes. Append-only, and
-- read as a set of candidates that the domain resolves (D5).
create table if not exists public.observations (
  id          text primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  code        text        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);

create index if not exists observations_user_day_idx  on public.observations (user_id, day);
create index if not exists observations_user_code_idx on public.observations (user_id, code);

-- ------------------------------------------------- the day-keyed aggregates -
create table if not exists public.sleep (
  id          text primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);
create index if not exists sleep_user_day_idx on public.sleep (user_id, day);

create table if not exists public.workouts (
  id          text primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);
create index if not exists workouts_user_day_idx on public.workouts (user_id, day);

create table if not exists public.goals (
  id          text primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);
create index if not exists goals_user_day_idx on public.goals (user_id, day);

-- The AI audit trail (D4, D13) syncs too: "why did the app think that" must
-- survive changing device.
create table if not exists public.inferences (
  id          text primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);
create index if not exists inferences_user_day_idx on public.inferences (user_id, day);

-- ------------------------------------------------------------- profiles ----
-- The one table that is genuinely mutable: a profile is current state, not a
-- log, so it is upserted rather than appended.
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- NOTE: there is deliberately no `settings` table. The API key lives on the
-- device and is never synced (D14, Q8) — that exclusion is why settings was a
-- separate store from the start. There is also no table for photos (Q10).
