# Payments — Lemon Squeezy

Status (2026-10-09): **built and tested, not yet connected.** Nothing charges
anyone until the steps below are done, starting in test mode.

## What was decided

| | |
| --- | --- |
| Price | US$8.99 a month (Vimetry Monthly) |
| Each month | 100 photo analyses and 200 written ones, counted separately, on GPT-6.1 Sol or GPT-6 Luna — the user's choice |
| Counts as written | a description, a leftover in words, week insights |
| Free | answering a follow-up question; "Again" (repeating a past meal never calls the AI) |
| Cancel | access to the end of the paid month |
| Full refund | access ends at once, and the subscription is cancelled so it is not charged again |
| Partial refund | changes nothing (treated as goodwill) |
| Delete account | the subscription is cancelled first; if that fails, the account is not deleted |
| Failed payment | access continues while Lemon Squeezy retries (`past_due`); ends at `unpaid` or `expired` |

Why the numbers: measured on the app's real prompts on 2026-10-09:

| | Photo | Description |
| --- | --- | --- |
| GPT-6.1 Sol | ≈ $0.016 (≈ $0.04 on a crowded plate) | ≈ $0.0065 |
| GPT-6 Luna | ≈ $0.001 | ≈ $0.0005 |

So a subscriber who uses everything on Sol costs about $1.60–$4 for photos
plus up to $1.30 for text, against $7.99 net of Lemon Squeezy's fees.

## How it works

- **`billing`** (user JWT) makes the checkout. The account's id goes into the
  checkout's custom data, and is how the webhook links the subscription to
  the account. It also returns the customer-portal link, which Lemon Squeezy
  signs for 24 hours.
- **`lemonsqueezy-webhook`** (`--no-verify-jwt`, signature-checked) stores the
  subscription in `subscriptions`. It does not store the buyer's name, email
  or card details. Each processed delivery is logged in `billing_events`, by a
  hash of its body.
- **`estimate-food`** checks for a subscription before the trial:
  - **Allowance.** It counts this billing month's photos or written analyses,
    by `usage.kind`.
  - **Key.** It uses `OPENAI_PLAN_KEY` if set, falling back to the trial key.
  - **Daily ceiling.** Subscribers have their own (default $50, set with
    `PLAN_DAILY_BUDGET_MICROS`), so a rush of trial users can't block someone
    who pays.
- **Billing month.** It runs from the anchor day to the anchor day, midnight
  UTC (`_shared/plan.ts`). It is not taken from `renews_at`, because
  `renews_at` moves to the retry date while a payment is failing.
- **Migration 0014** also fixes a bug: `reserve_analysis` used to count
  answered follow-up questions against the allowance.

Tests:

| Area | Tests |
| --- | --- |
| Webhook | `supabase/test/lemonsqueezy-webhook.ts` — signatures, redeliveries, out-of-order events, cancel, refund, deleted accounts, test vs live |
| Checkout and portal | `supabase/test/billing.ts` |
| Account deletion | `supabase/test/delete-account.ts` |
| Allowances | `supabase/test/estimate-food.ts` → "A subscriber" |
| Database rules | `01_verify.sql` → 0014 |
| Plan rules | `src/data/__tests__/plan.test.ts` |
| Screens | `e2e/subscription.spec.ts` |

## Setting it up (owner)

### 1. Deploy

Say "push", then run `./scripts/deploy-functions.sh`. This applies migration
0014 and deploys the two new functions.

### 2. Connect test mode

In the Lemon Squeezy dashboard, switch on **Test mode** (bottom left), then:

1. **Products:** Vimetry Monthly must exist as a subscription at $8.99 every
   month.
2. **Settings → Customer portal:** make sure it is on.
3. Run:
   ```bash
   ./scripts/set-billing-secrets.sh test
   ```
   It walks you through the webhook, the API key, the store id and the
   variant id, and sets them as Supabase secrets. It prints no secrets.

### 3. Buy it, as a test

Sign in to vimetry.app as the **test account** (`davidianmatan+phtest`),
never your own. Settings → Photo analysis → Subscribe. Pay with Lemon
Squeezy's test card: `4242 4242 4242 4242`, any future date, any CVC.

You should see each of the following:

1. **Back in Settings:** "Thank you!", then "Vimetry Monthly · renews on …".
2. **After analysing a meal:** the photo count goes up.
3. **Cancel:** Manage subscription → cancel. The card reads "cancelled —
   yours until …", and analysis still works.
4. **Refund:** in the dashboard, Orders → the order → Refund (full). The plan
   disappears from Settings, and the subscription shows as cancelled in Lemon
   Squeezy.
5. **Delete:** subscribe again, then delete the test account. The
   subscription shows as cancelled in Lemon Squeezy.

If something is off, Supabase → Table editor → `billing_events` shows what
the webhook did with each event (`result`).

### 4. Go live

Lemon Squeezy keeps test and live data apart:

1. Switch to live mode.
2. Make sure Vimetry Monthly exists there. The product page has a copy to
   live mode option.
3. Run `./scripts/set-billing-secrets.sh live`. This creates a new webhook
   and a new key, and clears `LEMONSQUEEZY_TEST_MODE`.

From then on, test events are ignored, so a test purchase can never grant
real access.

### Optional

- **A separate OpenAI project for subscribers.** It gets its own monthly
  limit, so a trial rush and paying users never share a budget. Create it,
  then run `npx supabase secrets set OPENAI_PLAN_KEY=…`.
- **Purchases made outside the app.** Don't share the store's public product
  link. A purchase made there carries no account id, and the webhook records
  it as `UNLINKED`. If one appears, refund it or contact the buyer.
