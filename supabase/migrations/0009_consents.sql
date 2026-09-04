-- Consent, recorded rather than assumed.
--
-- S5.2. GDPR Art. 9(2)(a) allows health data to be processed on EXPLICIT
-- consent, and "explicit" carries requirements that are all about evidence:
-- specific, informed, unambiguous, separable from the terms, and
-- demonstrable (Art. 7(1)). A boolean column saying `agreed = true` satisfies
-- none of that — it cannot say to what, in which words, or when.
--
-- So this is an event log, exactly like the rest of the model (D4). Granting
-- is a row. Withdrawing is another row, not a delete. A new policy version is
-- a new grant, and the old one stays readable, which is the only way to answer
-- "what had this person agreed to on the day we processed that photograph?"

create table if not exists public.consents (
  id           text        primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,

  -- What was agreed to. Deliberately broader than the two documents Phase 1
  -- needs: per-source consent (S5.6) adds values here rather than a table.
  subject      text        not null check (subject in ('PRIVACY', 'TERMS', 'AI_PROCESSING')),

  -- Which version of it. Dated rather than numbered, because the question
  -- asked later is always "what was in force in March", never "what was v3".
  version      text        not null,

  action       text        not null check (action in ('GRANTED', 'WITHDRAWN')),

  -- The language it was read in. A consent is informed only if the person
  -- understood the words, and this app is deliberately bilingual.
  locale       text        not null,

  /*
    A fingerprint of the exact text shown.

    Versions are decided by a human editing a file, and humans fix typos
    without bumping a version. This is what makes the record evidential rather
    than merely administrative: it can prove WHICH words were on screen, not
    just which label was attached to them.
  */
  document_sha text,

  recorded_at  timestamptz not null default now()
);

create index if not exists consents_user_subject_idx
  on public.consents (user_id, subject, recorded_at desc);

alter table public.consents enable row level security;

/*
  Read and append your own. No update, no delete — and that is the point.

  A consent log that its subject can edit proves nothing. Withdrawal is
  expressed by appending a WITHDRAWN row, which is both the honest record and
  the one an auditor can rely on.

  Erasure still wins: the cascade above means deleting an account takes the
  consent history with it. That is a real tension with Art. 7(1)'s "be able to
  demonstrate", and it is resolved in the person's favour deliberately —
  keeping a file on someone who asked to be forgotten, in order to prove they
  once agreed to be remembered, is the wrong way round for an app this size.
*/
drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents
  for insert to authenticated with check (user_id = auth.uid());

grant select, insert on public.consents to authenticated;

-- No admin policy (D19). What a person agreed to is about the person.
-- Aggregate "how many are on the current policy" is a metering question and
-- can be answered with a count, without reading anyone's row.
