# WhatsApp intake — plan review

Reviewing the proposed WhatsApp assistant. **The plan is sound and the shape is
right**: WhatsApp as another UI adapter over the same services, estimates
confirmed before saving, pairing rather than trusting a phone number, and a
`MessagingConnection` rather than fields on `User`. Every one of those matches
how this codebase already works.

What follows is what the plan assumes, what is actually true in the repository,
and the four things that would have bitten during implementation.

---

## 1. The reuse assumption is half right, and the wrong half is the schedule

> "If your current implementation already has those responsibilities properly
> separated from the React/UI layer, I would expect the integration to be
> moderate."

**They are separated from React.** `addEstimatedMeal` in
[`useHealthData.ts`](../../src/ui/useHealthData.ts) is three lines: call
`buildEstimatedMeal`, write the inference, write the meal. The builders —
`buildMeal`, `buildEstimatedMeal`, `buildObservation`, `buildGoal` — are pure
functions in `src/data/`, and the domain has no React in it at all.

**But none of it can run where the webhook runs.** Checked:

- **No edge function imports anything from `src/`.** Not one.
- The boundary is crossed in exactly one direction: `src/` imports
  `supabase/functions/_shared/prompt.ts`, in three places.

A WhatsApp webhook is a Deno edge function. `src/domain` is 2,341 lines of
browser-side TypeScript using `@/` path aliases and extensionless imports, and
Deno resolves neither. So "the bot invokes the same application service the web
UI invokes" is **not currently possible**, and the choice is:

- **(a) Duplicate the builders in Deno** — which is precisely the outcome the
  plan warns about, and worse here than usual: the duplicate would own
  provenance, canonical units (D8) and meal versioning (D15), so a drift
  between the two writes bad records rather than throwing.
- **(b) Move the pure domain and builders to shared ground**, and import them
  from both. `_shared/prompt.ts` is the precedent — that direction already
  works.

**(b), and it is the first task, not a later cleanup.** It is mechanical —
explicit `.ts` extensions and no `@/` — but it touches the domain, so it wants
doing while the test suite is the only thing depending on it. **Spike this
before estimating anything else**: put `buildMeal` behind a Deno `deno check`
and see what the import graph actually drags in.

This is the difference between the plan's "1–2 days for a POC" and reality.

---

## 2. WhatsApp is blocked on the naming decision

Not mentioned in the plan, and it is a hard scheduling dependency.

A WhatsApp Business Platform account requires **Meta Business verification** —
legal entity name, registered address, and documentary proof. Those are exactly
the `[UNDECIDED: …]` markers sitting in
[`src/policy/documents.ts`](../../src/policy/documents.ts) today. Verification
also takes calendar days to weeks and is not something to discover late.

**WhatsApp cannot ship before E3 and the legal entity exist.** Development can
start; the channel cannot open.

---

## 3. Identity is the security boundary, and it is weaker than the web's

The plan is right to insist on pairing. It is worth being blunt about why.

Every other write path in this app is authenticated by a Supabase JWT, and RLS
enforces per-row ownership (D16) — the database itself refuses to write to
someone else's rows. **A webhook has none of that.** Meta POSTs, the function
runs with the service role, and the only thing standing between a phone number
and a stranger's health record is a lookup table.

So:

- **Verify `X-Hub-Signature-256` on every request**, before parsing the body.
  Without it, anyone who learns the URL can write meals into any paired
  account.
- **Never trust a sender that is not in the connections table.** No implicit
  creation, no "phone looks like the one on the profile".
- **Store the pairing code hashed**, and expire it in minutes. `device_tokens`
  (migration 0008) already does exactly this — sha256, never plaintext.

### WA-01 and S4.1 are the same feature

Phase 1 already has **S4.1 — issue a device token from the web app** for
Garmin: mint a secret, show it once, list it, revoke it. WA-01 is the same
mechanism with a different provider.

**Build it once.** One `connections` table with a `provider` column
(`GARMIN`, `WHATSAPP`, later `TELEGRAM`), one issuance screen, one revocation
path. Building them separately means two secret-handling implementations, and
secret handling is the last place to want two of anything.

---

## 4. The trial meter has a hole in it, and it costs money

[`estimate-food`](../../supabase/functions/estimate-food/index.ts) identifies
the caller with `asCaller.auth.getUser()` — a JWT — and writes a `usage` row
against that user. **A WhatsApp webhook has no JWT.**

If the bot calls the estimator with the service role and skips that, then
**a paired WhatsApp number is an unmetered door to the owner's OpenAI key.**
And WhatsApp is designed to make logging frictionless, so it will be used more
than the web app, not less.

Resolve `phone → user_id` from the connections table and meter against that
user, on the same ledger, under the same `TRIAL_ANALYSES` ceiling. A WhatsApp
analysis must count exactly like a web one.

---

## 5. Duplicate deliveries corrupt silently here

The plan lists "retries/duplicate webhooks" as a hard part. In this codebase it
is worse than usual, and worth naming: records are **append-only** (D4). A
double-delivered message does not produce an error or a conflict — it produces
**two real meals**, both correctly formed, and the day's calories are quietly
wrong.

Meta retries on any non-200, including a timeout. So: store the WhatsApp
message id, make the write idempotent on it, and **return 200 fast** — do the
AI work after acknowledging, not before. An estimator call takes fifteen to
forty-five seconds; a webhook that waits for it will be retried while it works.

---

## 6. It changes a privacy claim that is already published

The policy says, in the section people actually read:

> a meal photograph is sent for analysis once and then discarded. It is not
> written to this device, not written to our database

WhatsApp breaks that shape. **Meta holds the media**, we download it with an
access token, and the request passes through Meta's infrastructure before ours.
Consequences, all of them real work:

- **Meta becomes a named processor** in the policy. "We use third parties" is
  not a disclosure.
- **The phone number joins the data inventory** — arguably more identifying
  than the email already there.
- The photo claim needs rewording for this path. There is a **test asserting
  that sentence** (`consent.test.ts`), so the drift will be caught rather than
  shipped — which is the point of keeping the policy in the repository.
- Consent: add `WHATSAPP` to the `subject` check in migration 0009. The
  constraint was written to be extended.

The plan's instinct to keep labs, diagnoses, medications and body photos off
this channel in phase 1 is right, and worth keeping as a stated rule rather
than an omission.

---

## 7. There is already a conversation model — do not invent a second

The plan proposes `ConversationSession` with `state` and `pendingAction`. Before
building that, note what exists (D20, "an estimate is a conversation"):

- `conversationId`, generated when an analysis starts and threaded through
  `setConversationId`
- `FollowUp[]` — question and answer pairs, replayed into the next call
- `MAX_FOLLOW_UPS = 2`, and the ledger records follow-ups as `OK_FOLLOWUP` so
  **a conversation costs one analysis**, not three

"The rice was about 250g" is exactly a follow-up. The WhatsApp session needs to
hold *which* conversation is open and what it is waiting for — but the
conversation itself, its budget and its metering are already built and tested.

---

## 8. Where I would sequence and scope it differently

**Text before photos, and ship text alone.** The plan's own table puts text at
2/10 and photos at 4/10, but the gap is wider than that: photos need
authenticated media download from Meta, size limits, and they are the expensive
call. Text-only delivers most of the value — logging in five seconds from the
lock screen — at a fraction of the risk. Ship WA-02, use it for a week, then
add WA-03.

**Summaries are the cheapest and best-tested thing here.** `readWeekReport`
already assembles a labelled week report, and the week-numbers work made it
honest about compared days versus all days. `/today` and `/week` are close to
free and would be the most-used commands.

**Suggested order:**

```
0. Spike: can Deno import the domain?        ← settles every estimate below
1. Shared domain + builders                  ← the refactor, done once
2. Connections table + issuance (WA-01/S4.1) ← one mechanism, two providers
3. Webhook: signature, idempotency, 200-fast ← the plumbing that must be right
4. WA-05/06 summaries                        ← cheapest, reuses tested code
5. WA-02 text meals + confirmation
6. WA-03 photos                              ← after Meta verification
```

Steps 0–3 are most of the work and none of it is WhatsApp-specific, which is
the plan's own point about keeping the adapter thin — just further down the
stack than it assumed.

---

## What the plan gets right, and should not be talked out of

- **Confirmation before saving.** Non-negotiable, and it matches
  `USER_CONFIRMED` versus `AI_ESTIMATE` provenance exactly.
- **Never letting the model write to the database.** Intent routing to real
  services is the same discipline as D13 and the AI port (D14).
- **`MessagingConnection[]` rather than `User.whatsappNumber`.** Same reasoning
  that keeps observations append-only with provenance.
- **Meta directly rather than Twilio.** For health data, one fewer processor is
  one fewer DPA, one fewer breach surface, and one fewer name in the policy.
- **User-initiated only in phase 1.** Proactive messages need approved
  templates and a 24-hour window; that is a separate feature with its own
  compliance surface.

---

## Estimate, revised

The plan's "1–2 days POC, 4–7 days for the real thing" is right **for the
WhatsApp part**. It omits the shared-domain refactor, which is the actual
gate. Until the spike in step 0 is done, any number is a guess — and that spike
is an afternoon.
