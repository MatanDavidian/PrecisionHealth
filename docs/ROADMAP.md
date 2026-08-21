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
[`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) — Q3 (aggregate rows are rewritten
while the facts inside them are append-only) and Q7 (nothing can be deleted)
are the two worth reading before the cloud slice (now slice 3).

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

**Outstanding before this counts as done by the roadmap's own definition:** a
first run against a live OpenAI key (the adapter is written but has never
called the real API), and a deploy over HTTPS so it works from a phone.

## Slice 3 — My data, on my devices ← next

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

**Proves:** the seam from D3, under real conditions — latency, failure, RLS,
and a schema migration with data in it.
**Ships:** durable, multi-device data, and the first accounts.

## Slice 4 — Import from Garmin

Sleep, HRV, resting heart rate, steps, weight. The first time two sources
describe the same day.

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

## Later, in rough order

Structured workout and nutrition plans → plan adherence evaluation → clinical
data (labs, conditions, regimens) → body-photo progression → longitudinal
insights with effect sizes → N-of-1 experiments → proactive agent.

Also parked here: **WhatsApp photo intake** (send a meal photo to a bot, it
logs it) — needs a server to receive webhooks, so it waits for the backend
from slice 3; and a **food database / barcode path**, which is the credible
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
