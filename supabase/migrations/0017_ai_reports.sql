-- Reports about an AI answer, sent from inside the app.
--
-- Google Play's AI-generated content policy asks for a way to report
-- offensive AI output without leaving the app. What a report holds is
-- deliberately small: which feature, why, an optional note, the model and
-- the build. NOT the meal, NOT the AI's answer, NOT who sent it — so a report
-- carries no health data and identifies nobody (unless the note does, which
-- the form asks people not to do, and report-ai scrubs).

create table if not exists public.ai_reports (
  id          bigserial   primary key,
  created_at  timestamptz not null default now(),
  kind        text        not null check (kind in ('estimate', 'insight')),
  reason      text        not null check (reason in ('offensive', 'harmful', 'wrong', 'other')),
  note        text        check (char_length(note) <= 500),
  model       text,
  version     text
);

create index if not exists ai_reports_created_idx on public.ai_reports (created_at desc);

revoke all on public.ai_reports from anon, authenticated;
alter table public.ai_reports enable row level security;

/**
 * Records one report. False when the day already holds 500 — the endpoint is
 * public, so a flood stops being recorded rather than filling the table.
 * Kept for a year.
 */
create or replace function public.record_ai_report(
  p_kind    text,
  p_reason  text,
  p_note    text,
  p_model   text,
  p_version text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.ai_reports where created_at > now() - interval '1 day') >= 500 then
    return false;
  end if;
  insert into public.ai_reports (kind, reason, note, model, version)
  values (p_kind, p_reason, left(p_note, 500), left(p_model, 64), left(p_version, 64));
  delete from public.ai_reports where created_at < now() - interval '365 days';
  return true;
end
$$;

revoke all on function public.record_ai_report(text, text, text, text, text) from public, anon, authenticated;
