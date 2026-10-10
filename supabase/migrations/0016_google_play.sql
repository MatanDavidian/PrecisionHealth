-- Google Play as a second seller of the same plan (docs/ANDROID-APP.md, step 4).
--
-- One subscriptions table for both: entitlement reads the same columns
-- whoever sold it. A Play subscription's id is its purchase token.

alter table public.subscriptions
  add column if not exists provider text not null default 'lemonsqueezy';
alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('lemonsqueezy', 'google_play'));

-- A re-subscription or plan change on Play issues a new token that names the
-- old one; the old row is then superseded rather than left looking active.
alter table public.subscriptions add column if not exists linked_purchase_token text;
create index if not exists subscriptions_linked_idx on public.subscriptions (linked_purchase_token);
