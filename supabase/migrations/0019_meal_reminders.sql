-- Meal reminders (docs/features/meal-reminders.md): breakfast, lunch and
-- dinner, each on or off at its own time, each offering the meal the person
-- usually eats then as a one-tap button.
--
-- The usual meals are worked out by the app (the rule already lives there,
-- `findUsualMeals`) and kept here, top three per meal, so the schedule can
-- name them without a second copy of the rule.

alter table public.user_preferences
  add column if not exists breakfast_reminder boolean not null default false,
  add column if not exists breakfast_time     text    not null default '08:30',
  add column if not exists lunch_reminder     boolean not null default false,
  add column if not exists lunch_time         text    not null default '13:30',
  add column if not exists dinner_reminder    boolean not null default false,
  add column if not exists dinner_time        text    not null default '20:00',
  -- {"BREAKFAST":[{"key":…,"name":…,"kcal":…}], "LUNCH":[…], "DINNER":[…]}
  add column if not exists reminder_usuals    jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_preferences_meal_times_check') then
    alter table public.user_preferences
      add constraint user_preferences_meal_times_check check (
        breakfast_time ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' and breakfast_time between '05:00' and '11:45'
        and lunch_time ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' and lunch_time between '11:00' and '16:45'
        and dinner_time ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' and dinner_time between '17:00' and '23:45'
      );
  end if;
  -- Three meals of three names each is small; anything larger is not this.
  if not exists (select 1 from pg_constraint where conname = 'user_preferences_reminder_usuals_size') then
    alter table public.user_preferences
      add constraint user_preferences_reminder_usuals_size check (
        reminder_usuals is null or octet_length(reminder_usuals::text) <= 4000
      );
  end if;
end $$;

-- The log now records each meal's reminder too, once a day each.
alter table public.reminder_log drop constraint if exists reminder_log_kind_check;
alter table public.reminder_log
  add constraint reminder_log_kind_check check (kind in ('MEAL', 'WATCH', 'BREAKFAST', 'LUNCH', 'DINNER'));
