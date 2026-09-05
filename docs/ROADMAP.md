# Roadmap

This reworks the phase plan in
[`requirements/AI_Driven_Health_App_Product_Roadmap.docx`](requirements/AI_Driven_Health_App_Product_Roadmap.docx).
The product thinking there is kept; the *sequencing* is changed, for one reason
given below.

## The change: vertical slices, not horizontal layers

The original plan is ordered by layer — domain model, then repositories, then
UI, then manual logging, then backend, then integrations, then AI. Each phase
is a complete horizontal band across the system.

That ordering has a specific failure mode: **the first four phases produce
nothing you can use.** Manual logging — the first real feature — arrives at
phase 5, and nothing you log survives until the backend lands at phase 6. So
the model's write path goes unvalidated for four phases, and every mistake in
it is discovered late, when the work already sits on top of it.

This plan slices vertically instead. Each slice cuts through every layer —
model, store, UI — and ends with something you can actually use that evening.
The layered work still happens; it just happens a slice at a time, driven by a
feature that proves it.

The original document's **"What not to build initially"** list survives intact
and is the best page in it.

---

## Slice 0 — Skeleton ✅ done

Domain model, repository interfaces, mock store, Today screen rendering a
seeded day end to end.

**Proves:** the layering works and the seed day renders.
**Ships:** nothing user-facing — this is the only slice that doesn't, which is
why it was kept to days rather than weeks.

## Slice 1 — Log a meal, watch today's protein move ✅ done

Manual meal entry, persisted in the browser (IndexedDB), Today recalculating
from stored data. No accounts, no server, no network. Confirming an AI estimate
and settling a two-source conflict both write real superseding records.

**Proved:** the write path, and it found a bug a read-only mock could not — a
conflict the user had settled kept being raised, because `detectConflict` was
not filtering superseded records. Live in `liveRecords()` now, with a test.
**Ships:** a usable protein tracker.

Assumptions taken along the way are in
[`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) — Q3 has since been settled as D15
(meal versioning, opening slice 3); Q7 (nothing can be deleted) is still open
and worth reading before the cloud slice.

## Slice 2 — Photograph a meal, AI does the numbers ✅ built

Resequenced ahead of auth on a product call (Aug 2026): manual macro entry is
the thing nobody sustains, and the BYOK decision (D14) — the user's own
provider key, stored on-device, calling the provider directly — removes the
server dependency that had this waiting behind the backend.

Camera-first Log screen becomes the app's default view: shutter + one tap to a
saved meal. Optional hints (food name, grams, time) that the model must honour;
everything else estimated — kcal, protein, carbs, fat. Estimates land as
`AI_ESTIMATE` provenance with confidence and an `AIInference` audit row; the
slice-1 Confirm flow settles them. Includes Settings (local key storage), the
first IndexedDB migration, and mobile navigation.

Full plan: [`features/photo-meal-logging.md`](features/photo-meal-logging.md).

**Proved:** the provenance apparatus end to end — `AIInference` logging,
`needsConfirmation`, the supersede chain — and found a second bug the unit
tests could not: the Log screen gated analysis on "is a key set" rather than
"does this estimator need one", which would have blocked slice 3's
server-proxy mode too.
**Ships:** the product's actual differentiator, and the fastest way to log food.

**Since verified against the live API** (real key, real photo — which caught a
prompt that refused groceries and an image-detail setting that starved
portions; both fixed). Outstanding: the HTTPS deploy, which moves into
slice 3.

## Slice 3 — My data, on my devices ← in progress

**Step 0 done:** meal versioning (D15) — meals append a version per edit,
same-version records raise a conflict the user settles. The change that had to
precede sync now has, and the app is better for it regardless of what follows.

Supabase (D16): accounts via email code, each family member's data isolated by
Row-Level Security, online-first. Opens with the D15 meal-versioning fix —
the one change that must precede sync rather than follow it. Append-only
becomes a database grant (INSERT/SELECT only), the same-version conflict
becomes a unique constraint, and first sign-in adopts this browser's real
records while leaving the demo day behind (its fixed ids give it away).
`settings` — and the API key in it — is excluded from sync by design. Includes
the HTTPS deploy that slice 2 left outstanding. The server-side AI proxy stays
out; BYOK continues.

Full plan: [`features/supabase-sync.md`](features/supabase-sync.md).

**Proved:** the seam from D3 under real conditions. The Supabase adapter passed
the same ten behavioural assertions as IndexedDB without a single change —
which is what makes "swapping the store cannot change what a screen sees" a
tested fact rather than a claim. Everything that broke along the way was the
test harness assuming it could clean up after itself, which an append-only
schema forbids.
**Ships:** durable, multi-device data, the first accounts, and the app running
over HTTPS at precisionhealth-9bn.pages.dev — so the camera is finally on the
device that has one.

## Slice 3.5 — AI access: server keys, free trial, paid plans ← next

Inserted ahead of Garmin at the owner's request. Three asks that turn out to
be one feature: a **server-side AI proxy**. A master key in the browser is
extracted in minutes, a client-enforced quota is a suggestion, and a
subscription must be provable — so all three need code the user cannot read.
D14 reserved the space for exactly this; the estimator port means it is one
new adapter, and no screen changes.

Full plan: [`features/ai-access-plans.md`](features/ai-access-plans.md).

**Proves:** that the second estimator mode fits the seam D14 claimed it would.
**Ships:** photo analysis that works the moment you sign in, without anyone
pasting a key.

## Slice 3.6 — Repeat what you usually eat ✅ built

Inserted between AI access and Garmin, on the owner's call: the fastest photo
in the world is still slower than not taking one. Usual meals for the current
slot, single-food chips that combine into a snack, search across everything
ever logged, and a whole-day repeat that places each meal at the time of day it
was eaten — skipping the ones whose hour has not come round yet.

Full plan: [`features/repeat-meals.md`](features/repeat-meals.md).

**Proved:** that the append-only model makes a repeat trivial — a repeat is
just another meal record, so versioning, conflicts and Undo needed no special
case. The provenance rule did need thought: a repeated *confirmed* meal is a
user entry, a repeated *estimate* is still an estimate.
**Ships:** logging a familiar day in one tap, and the end of photographing the
same breakfast every morning.

## Slice 3.7 — Three ways in, and a meal you can fix ✅ built

Two things the app was missing, with one cause: whatever you came to Log to do,
it was below something else, and once a meal was logged it was final.

The Log screen becomes three modes — **Photo** (with an optional note that goes
to the model: "no oil", "half portion"), **Write** (describe it and get the same
estimate), **Again** (search and repeat). Each holds one input and nothing else.
And every logged meal gains Edit and Delete: change the grams and the macros
follow by ratio, remove a food, move it to another slot — or delete it, with
Undo.

Full plan:
[`features/log-modes-and-meal-edits.md`](features/log-modes-and-meal-edits.md).

**Proved:** both seams paid out. Adding a second input to the estimator port
cost one method on three adapters and one branch in the edge function —
validation, entitlement, the ledger and the whole result UI were already
input-agnostic (D14). And editing needed no new storage mechanism at all:
versioning (D15) and item supersession (D4) had been carrying the weight since
before anything used them.
**Ships:** logging the meal you already ate, and fixing the portion the model
got wrong instead of confirming a number you know is off.

## Slice 3.8 — An estimate you can argue with ✅ built

Two requests that turned out to be one idea: the estimate is a starting point,
not a verdict. Its numbers are editable in place before saving — with
re-portioning by ratio and each row showing what the model had said — and the
model may ask one clarifying question whose answer produces a firmer estimate.
A whole conversation about one meal costs one analysis, capped at two
follow-ups.

Full plan: [`features/estimate-conversation.md`](features/estimate-conversation.md).

**Proved:** that D15's editing rule generalises — a corrected item is a user
entry at both moments, before and after saving — and that the append-only
ledger absorbed a second kind of billable event without either trial counter
changing. Found a real React bug the unit tests could not: reading state inside
a `setState` updater and starting work from there, which made answering a
question silently do nothing.
**Ships:** the ability to fix a number while you are looking at it, and a model
that can ask instead of guessing.

## Slice 3.9 — Hebrew, right to left ✅ built

The app speaks English or Hebrew, chosen per device, with the layout mirrored
and the model asked to answer in the same language — so the screen is not
Hebrew everywhere except the food names.

Full plan: [`features/hebrew-and-rtl.md`](features/hebrew-and-rtl.md).

**Proved:** that a typed dictionary derived from English makes an incomplete
translation a build failure rather than a half-translated screen. Found a
settings bug that only a browser could: the store wrote any key but read from a
whitelist, so the choice persisted and came back empty.
**Ships:** an app the owner can read in their own language.

## Slice 3.10 — Numbers you can type ✅ built

Current weight, a target weight, and the calories you spent in a day — enterable
on Today, because the dashboard was showing seeded figures with no way to put
real ones there.

Full plan: [`features/manual-body-and-energy.md`](features/manual-body-and-energy.md).

**Proved:** that the domain modelled in slice 0 was worth modelling. `WEIGHT`,
`ACTIVE_ENERGY`, `Goal` and the precedence rules all already existed; the work
was a write path and somewhere to tap. And it exercised D6 on real input for
the first time — a typed weight joined an existing conflict rather than
overwriting it.
**Ships:** a Today screen that is useful before any device is connected to it.

## Slice 3.11 — A goal with a shape, and a week to judge it by ✅ built

Five objectives rather than a bare target number, and a Day/Week toggle showing
eaten against burned across seven days with a verdict against the objective.

Full plan: [`features/objectives-and-the-week.md`](features/objectives-and-the-week.md).

**Proved:** that refusing to average missing data is worth the extra field. A
day with no burned figure stays undefined rather than zero, the week's target
scales to the days that reported, and the screen says so — otherwise absence
would read as a deficit.
**Ships:** the first answer to "was this week any good?", and the first screen
that grades rather than reports.

## Slice 3.12 — Ask the model about your week ✅ built

Seven days of meals, the totals and the goal, sent on request — and read back as
a summary, what is visible in the data, and what is worth trying. The week
refuses to draw or grade anything until there is a burn figure and an objective.

Full plan: [`features/week-insights.md`](features/week-insights.md).

**Proved:** that a named payload type is worth more than a comment. The promise
on the button — "nothing that says who you are" — is asserted by a test that
serialises a real report and fails on any identity in it.
**Ships:** the first advice the app gives, and the first thing it sends
anywhere on purpose.

## Slice 4 — Import from Garmin ✅ built

Sleep, HRV, resting heart rate, steps, weight. The first time two sources
describe the same day.

**Was blocked, then wasn't (Sep 2026).** Garmin's Health API is still
partner-approval only with applications closed. **Connect IQ turned out to be a
different door entirely** — no approval needed, an app that runs on the watch,
sideloaded over USB. It reads `ActivityMonitor.getHistory()` and posts completed
days to an edge function.

Established on hardware rather than assumed: `History.calories` is **total**
daily energy (2214, matching Garmin Connect exactly, against an active figure of
131 — mapping it to `ACTIVE_ENERGY` would have understated every day by 2,083
kcal). Days anchor at local midnight, seven are available, and `[0]` is
yesterday.

It syncs when the app opens, and once each morning from a background service
without being opened at all. Sleep and HRV remain out of reach — Connect IQ does
not expose them — so the Recovery section still needs a second adapter. See
[`features/manual-body-and-energy.md`](features/manual-body-and-energy.md) §4
and [`../garmin/README.md`](../garmin/README.md).

**Proves:** conflict detection (D6) against real device noise, and whether the
tolerances are tuned anywhere near right.
**Ships:** the Today screen filling itself in without typing.

## Slice 5 — Goals and adherence

Deterministic rule evaluation over stored data. Streaks, targets, weekly
rollups.

**Proves:** D13 — that the engine computes what the AI would otherwise be
tempted to assert.
**Ships:** the reason to open the app daily.

## Slice 6 — Health scan

AI summarises across nutrition, training, recovery and body — every claim
linked to the records it came from, refusing to conclude where data is thin.

**Proves:** AI reading structured data rather than becoming it.
**Ships:** the "See what changed this week" card that is currently a placeholder.

## Phase 1 — a product rather than a tool

Everything above assumes one user, one watch, and a developer on hand.
**[`PHASE-1.md`](PHASE-1.md)** is the plan that stops that being true: repeat a
meal onto another day, cover what exists with tests, a name and a domain,
per-device authentication and the Connect IQ Store, the legal floor, and
payments.

Its companion **[`COMPLIANCE.md`](COMPLIANCE.md)** works out which parts of
Israeli, EU and US law fall on the architecture — the parts that are nearly free
to build now and expensive to retrofit.

The slices below are Phase 2 and beyond. **None of them should start while
Phase 1 is unfinished**, because each one adds surface that Phase 1 would then
have to cover.

## Later, in rough order

Structured workout and nutrition plans → plan adherence evaluation → clinical
data (labs, conditions, regimens) → body-photo progression → longitudinal
insights with effect sizes → N-of-1 experiments → proactive agent.

**WhatsApp intake** was parked here waiting for a backend; slice 3 delivered
one, so it is now unblocked and planned in
[`features/whatsapp-intake.md`](features/whatsapp-intake.md). Two findings from
reviewing it are worth having in the roadmap itself: the webhook is a Deno
function and **cannot import a line of `src/`**, so sharing the meal builders
is a prerequisite rather than a detail; and a WhatsApp Business account needs
**Meta Business verification**, which needs the legal entity E3 has not decided
— so the channel cannot open before the name does.

Also parked here: a **food database / barcode path**, which is the credible
route to micronutrients (photo → identity → database), per the slice-2 spec.

Each is a slice on the same pattern. None of them should start before the slice
below it is in daily use.

---

## Working notes

**Definition of done for a slice:** it works E2E for a real day of your own
data, the domain rules it touches have tests, and it is deployed somewhere you
can reach from your phone. A slice that only works on localhost isn't finished.

**Keep from the original document, unchanged:** data first and AI second;
normalise external data into one internal model; separate raw from derived;
keep provenance everywhere; controlled AI tool access rather than database
access; structured plans over prose; correlation is not causation; ask the user
where uncertainty is material.

**On the agent team idea** (PM, engineer, QA, customer success, cost advisor):
that is a *delivery-process* investment, not product architecture, and it pays
off in proportion to how much product there is to manage. Worth revisiting once
a slice is shipping regularly and there is CI to hang it on. Building it before
there is a product to run it against would be the same mistake as the watch app.

**On changing technology later:** D2 and D3 exist precisely so that this is
affordable. The domain layer is portable, the store is behind an interface, and
the UI is the only part genuinely coupled to React. If the mobile app becomes
the main surface, the rewrite is one layer, not one system.
