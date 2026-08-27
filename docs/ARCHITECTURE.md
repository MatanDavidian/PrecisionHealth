# Architecture decisions

Numbered decisions with the reasoning behind them, so a future change is a
deliberate reversal rather than an accident. Each one is implemented in code —
the file is named — and the important ones are covered by tests.

Status: decided at Phase 1 (Aug 2026). Nothing here is sacred; all of it is
written down so the cost of changing it is visible.

---

## D1 — React on the web, not Flutter

**Decision.** The client is React + TypeScript. Flutter, which the product
roadmap recommended, is not adopted.

**Why.** The roadmap's own text notes that Garmin watch apps require Connect IQ
regardless of client choice, so "one codebase everywhere" was never available.
That leaves web (Flutter's weakest target and this product's only proven
demand), desktop (a wrapper either way, and one the roadmap defers anyway) and
mobile (Flutter's genuine advantage — deferred here, with responsive web
covering phones until native HealthKit / Health Connect access is needed).
Existing UI mockups are responsive web, and the design tooling around them
emits React.

**Consequence.** A polished native mobile app later means rewriting the UI
layer. That cost is deliberately deferred and is bounded by D2.

**Revisit when** mobile becomes the primary surface, or when native health APIs
(HealthKit, Health Connect) need direct device access rather than server-side
sync.

## D2 — The domain layer has no framework imports

**Decision.** `src/domain/` imports nothing but itself. No React, no HTTP
client, no database driver.

**Why.** It is the only asset that must survive every technology change. The
entities, units, provenance rules and conflict resolution are the product; the
renderer and the store are implementation details.

**Consequence.** The same logic can be lifted into a server, a worker, or a
future native client unchanged. It also means the domain cannot fetch anything —
callers supply data, which is why repositories exist (D3).

## D3 — The UI depends on repository interfaces, never on a store

**Decision.** `src/data/repositories.ts` defines interfaces; screens use only
those. The concrete store is named in exactly one place — the composition root,
`src/data/index.ts` — and UI code imports `repositories` from there. Every
method is async, including in the mock.

**Why.** It makes infrastructure a late and reversible decision (D9). A
synchronous mock that later became a network call would force a rewrite of
every caller, so the mock is async from day one even though it does not need
to be.

**Consequence.** Swapping in-memory → IndexedDB → HTTP means writing the new
adapter and changing one line in `src/data/index.ts`; no screen changes. The
claim holds only while nothing outside `src/data/` imports a concrete store —
worth a lint rule once there is more than one.

## D4 — Records are append-only

**Decision.** Nothing is mutated or deleted. A correction is a new record whose
provenance lists the ids it `supersedes`.

**Why.** "The AI guessed 170 g and I corrected it to 190 g" is two facts, not
one. Overwriting destroys the audit trail the roadmap's safety section requires,
makes AI writes irreversible, and makes it impossible to answer "why did the app
think that?".

**Consequence.** Storage grows with corrections, and every read must resolve
candidates (D5). Both are cheap; losing history is not.

**Implemented in** `src/domain/provenance.ts`.

## D5 — Precedence: USER_CONFIRMED > device > AI_ESTIMATE

**Decision.** When several records describe the same thing, the effective value
is chosen by kind first (confirmed beats raw beats derived), then by source rank
(a dedicated scale outranks a phone; a lab document outranks both for
analytes), then by recency. `resolveEffective` is a pure function used by every
reader.

**Why.** A wearable measurement, a manual entry and an AI estimate are not
equivalent evidence. Encoding that as one pure function means the client and the
future server cannot drift apart on what "the" value is.

**Consequence.** Reads return all candidates, not a pre-resolved value — which
is what makes D6 possible.

**Implemented in** `src/domain/provenance.ts`, tested in
`src/domain/__tests__/provenance.test.ts`.

## D6 — Disagreements are surfaced, not silently resolved

**Decision.** When two sources differ by more than the metric's tolerance
(`CONFLICT_TOLERANCE`), the app raises a conflict for the user instead of
quietly picking a winner or averaging. Their answer is written as a new
USER_CONFIRMED record that supersedes the others. (Detection and display are
built; the confirm-and-write step arrives with the first write path, slice 1.)

**Why.** Silent resolution is how health apps lose trust: the number changes and
nobody can say why. Surfacing the disagreement also produces the single most
valuable signal in the system — a human adjudicating between sources.

**Consequence.** Tolerances are judgement calls per metric and will need tuning
with real data. They live in one table, not scattered through queries.

**Implemented in** `src/domain/provenance.ts` (`detectConflict`),
`src/domain/observation.ts` (tolerances), `src/ui/components/ConflictNotice.tsx`
(the surface); tested in `src/domain/__tests__/provenance.test.ts`.

## D7 — Every instant is UTC, and every record stores its zone

**Decision.** Timestamps are UTC. **In addition**, each record stores the IANA
timezone in effect where it happened. The local day is derived from both.

**Why.** UTC alone answers "when", but not "which day", and health data is full
of daily questions — daily protein, daily steps, streaks, adherence. Deriving
the local day in the UI would give a different answer per viewing device and
would make server-side goal evaluation impossible. Storing a fixed offset
instead of a zone name breaks across DST. Storing only the user's *current*
zone silently re-buckets history after travel.

**Consequence.** A 01:00 meal belongs to the day that just started (boundary at
local midnight, one constant in `time.ts` if that ever becomes a user setting).
Sleep is attributed to the **wake** day, matching Garmin, Oura and Whoop.

**Implemented in** `src/domain/time.ts`, tested in
`src/domain/__tests__/time.test.ts` — including travel and a DST boundary.

## D8 — One canonical unit per dimension, enforced by the type system

**Decision.** Stored values are `CanonicalQuantity`: mass in grams, length in
centimetres, energy in kcal, duration in seconds. The type is branded, so a
plain `Quantity` cannot be stored — the compiler rejects it. Conversion happens
only at input and display.

**Why.** Unit bugs in a health app are silent and dangerous; `72.8` meaning kg
in one path and lb in another is the classic failure. A convention in a comment
erodes. An invariant in the type system does not.

**Consequence.** Stored values are in base units — a raw record says `72800 g`,
not `72.8 kg` — so debugging output takes a moment's translation. Authoring
stays friendly: `canonical(72.8, 'kg')` converts at construction, and
`src/ui/format.ts` is the single place stored values become human again.

**Implemented in** `src/domain/units.ts`, tested in
`src/domain/__tests__/units.test.ts`.

## D9 — Infrastructure is chosen late, in three steps

**Decision.** No backend now. Persistence progresses:

1. **Now** — in-memory, then IndexedDB in the browser. Zero infrastructure, real
   write path, works offline.
2. **Then** — managed Postgres with auth and object storage (Supabase is the
   recommendation) behind the same repository interfaces.
3. **When AI lands** — originally planned as a server-side function so keys
   never reach the browser. Amended by D14 (Aug 2026): AI arrives *before* the
   backend, on the user's own key, stored on-device. The server-side proxy
   with a managed key becomes the second mode when the backend exists. Every
   inference is logged as an `AIInference` record in both modes — that part is
   unchanged.

**Why.** The original plan spends four phases on layers before the first
feature (manual logging, phase 5) and makes nothing durable until the backend
(phase 6). Starting local makes slice 1 shippable in days, and D3 means the
eventual move is an adapter swap rather than a migration.

Supabase is recommended over building on ASP.NET Core first — despite that being
the stronger existing skill here — purely for time-to-first-slice. It is real
Postgres underneath, so the schema is portable and a later move to a custom
backend is a dump and a restore, not a rewrite.

**Revisit when** multi-user, compliance, or heavy background ingestion arrives —
all of which favour a real backend service.

## D10 — Observation is the spine; only aggregates get their own type

**Decision.** Every scalar, coded, time-stamped fact is an `Observation` —
steps, HRV, weight, body fat, mood, and lab analytes alike. The earlier
`Measurement` type was deleted as a duplicate of it. Types of their own are
reserved for things with children: `Meal` (food items), `Workout` (exercises),
`Sleep` (stages).

**Why.** This is what FHIR does, for the reason that matters here: the
alternative is a near-identical table per metric, each with its own repository,
sync path, conflict handling and day-bucketing. One spine means one of each.

**Consequence.** Lab results are Observations with a `clinical` detail block;
`LabPanel` exists only because a blood draw genuinely groups analytes that share
a collection time and a source document.

## D11 — Medications and supplements are one type; intent is separate from fact

**Decision.** A `Regimen` (substance, dose, schedule, period, kind =
MEDICATION | SUPPLEMENT) describes what should be taken. An `IntakeEvent`
records what actually was. Adherence is derived by comparing them.

**Why.** Vitamin D and metformin differ in regulation, not in structure —
separate types would mean two adherence calculations and two places to update
whenever the AI needs to know what the user takes. And collapsing intent into
fact makes adherence unanswerable, which is the main reason to track medication
at all. It is the same raw-versus-derived split applied everywhere else.

**Implemented in** `src/domain/clinical.ts`.

## D12 — Experiments are modelled now, built much later

**Decision.** The `Experiment` type exists at Phase 1 although no screen uses it.

**Why.** It is the only feature that constrains everything else: it compares a
metric across time windows, so observations must be queryable by window, must
carry provenance (an AI-estimated intake cannot be evidence in your own
experiment), and must never be silently rewritten. The model already satisfies
all three — discovering that requirement later would have meant a migration.

**Consequence.** Its evaluation stores `sampleSize` and an `inconclusive` flag,
so a two-day "result" can never be presented as evidence. A model may narrate
the outcome; the numbers come from the rule engine.

## D13 — Deterministic before intelligent

**Decision.** Goals, adherence and experiment evaluation are computed by rules.
AI proposes, structures and explains; it never asserts a number that the engine
could compute.

**Why.** It is the roadmap's stated principle, and it is what keeps AI output
auditable. A generated plan is a domain object rendered by the UI, not prose.

**Consequence.** Every AI feature needs a deterministic counterpart to check it
against — which is also what makes AI regressions detectable.

## D14 — AI runs on the user's own key, from the device (BYOK)

**Decision.** The first AI feature (photo meal logging, slice 2) calls the
provider directly from the browser with an API key the user supplies in
Settings. The key is stored on-device only, sent to exactly one host (the
provider's API), never synced, never exported. Behind a
`FoodEstimator` port — the same seam pattern as D3 — so a server-proxy
adapter can slot in later without touching the UI.

**Why.** This is what unblocks AI before the backend exists: no server, no
place to keep a managed key, and the alternative was parking the product's
differentiator behind an infrastructure slice. It also matches the product's
posture — the user's data goes from their device to their chosen provider on
their own account, with no intermediary of ours to trust.

**Consequence.** A key in browser storage is readable by anything that can run
script in the origin (Q8) — a small surface here (static site, no third-party
scripts) but a real one, stated plainly in Settings along with the advice to
use a spend-capped key. And provider choice is constrained by CORS: each
candidate must permit browser-origin calls, verified before it appears in
Settings.

**Revisit when** slice 3 ships the server proxy (BYOK becomes one of two
modes), or if the app ever becomes multi-user on shared machines.

**Since** (Aug 2026) the port carries a second input: `estimateFromText`
alongside `estimate`, because a photo and a sentence are the same question with
different evidence. It cost one method on three adapters and one branch in the
edge function; everything downstream — validation, entitlement, the ledger, the
result card, the audit record — was already input-agnostic. That is the return
the seam was bought for, and it is why the port is now `FoodEstimator` rather
than `FoodVisionEstimator` (kept as an alias).

**Amends** D9 step 3. **Planned in**
`docs/features/photo-meal-logging.md` and
`docs/features/log-modes-and-meal-edits.md`.

## D15 — Aggregates are versioned, not rewritten

**Decision.** A meal is never updated in place. Each edit appends a new meal
record with the same `mealId` and `version + 1`. Readers take the highest
version; two records sharing a version are a conflict, surfaced to the user,
whose answer is written as the next version.

**Why.** D4 made single facts append-only, which is what lets observations sync
by simply taking the union of both devices' records. Meals broke that rule —
one row holding all its items, rewritten on every confirmation — so two devices
editing the same meal would silently overwrite each other the moment sync
existed. Versioning restores the invariant using the mechanism already proven
on screen for observations (D6).

**Consequence.** Storage grows per edit, and meal-level versioning reports a
conflict even when two devices edited different items of the same meal — edits
that are mergeable in principle. Accepted: the simplicity is worth more than
the false-conflict rate for a family-sized app.

**Must precede sync** (D16). Afterwards it is a live data-loss bug rather than a
latent one. **Planned in** `docs/OPEN_QUESTIONS.md` Q3.

**Cashed in** (Aug 2026). For a year this bought only Confirm and Undo — the
edit path it was designed for did not exist in the UI. It does now:
`applyMealEdit` writes the next version with each changed food superseding the
old one inside it, and `restoreMeal` un-deletes by appending a version saying
the meal happened after all. No new mechanism was needed, which is the whole
argument for having modelled it early (D12's reasoning, applied to meals).
**Built in** `docs/features/log-modes-and-meal-edits.md`.

## D16 — Supabase for the backend, online-first, real accounts from day one

**Decision.** Slice 3 uses Supabase — managed Postgres, auth, storage and edge
functions — behind the existing repository interfaces. The app is online-first;
offline support is a later addition, not a slice 3 requirement. Accounts and
row-level isolation are built in from the start, not retrofitted.

**Why Supabase over Firestore.** The roadmap chose Postgres deliberately, and
the analytics phases (13-17: correlations, effect sizes, N-of-1 evaluation) are
exactly what a document store is bad at — choosing Firestore would trade the
product's endgame for convenience the app has already deferred. Postgres also
means the schema is portable: moving to a self-hosted ASP.NET service later is
a dump and a restore, not a re-modelling. Row-Level Security expresses "each
user sees only their own rows" once, enforced by the database rather than by
every query.

**Why accounts now.** The app is intended for family and friends, and possibly
a wider audience later. Multi-user isolation is cheap to design in and painful
to retrofit — every table, every query and every sync path assumes it.

**Why online-first.** Offline sync is genuinely hard, and the append-only model
(D4, D15) is what will make it tractable when it arrives: records only ever get
added, so an offline queue replays rather than merges. Choosing online-first now
costs nothing later.

**Consequence.** The app stops working without a connection until offline
support lands. Write failures therefore have to be visible and retryable —
which is why that was fixed before any of this was built.

**Revisit when** hosting cost, data-residency or the AI tool layer (roadmap
phases 7-12) argue for a self-hosted ASP.NET service. The seam (D3) keeps that
affordable.

## D20 — An estimate is a starting point, not a verdict

**Decision.** An AI estimate is editable before it is saved, and the model may
ask one clarifying question — but a question never replaces an estimate, and
answering is always optional.

**Why.** The moment a person is most likely to know a number is wrong is the
moment they are looking at it next to the food. Before this, the card offered
Save or Discard, so the options were to save a number you could see was wrong
and fix it on another screen, or throw the analysis away and photograph the
plate again. Neither is a thing anyone should have to choose between.

The same reasoning runs the other way. The model is often uncertain about
exactly one thing it cannot see — grilled or fried, whole milk or skimmed — and
one sentence from the person holding the plate is worth more than a better
model would have been. It could not ask; it guessed, and lowered its confidence.

**The rule that makes the question safe.** The estimate is always complete and
always saveable. A question that could block a save would be worse than no
question, because it turns a working flow into a modal one. So the prompt
requires items and confidence in every reply, the UI says out loud that
answering is optional, and Skip sits beside Send.

**Provenance consequence.** A corrected item is written as `USER` / `RAW`, not
as a confirmed estimate: a human looked at the number and said what it should
be, which is precisely confirmation. Items left alone stay `AI_ESTIMATE` and
still want confirming, so one meal can carry both honestly. This is the rule
D15's `applyMealEdit` already applied to a saved meal — one rule at two
moments.

**What is never mutated.** `EstimateResult` stays exactly what the model
returned; corrections travel beside it into the `AIInference` row. The audit
answers both halves of "why does it say that?" — what the model claimed, and
what the human overrode. **Built in**
`docs/features/estimate-conversation.md`.

**Revisit when** a conversation needs to survive across devices, or when
follow-ups stop being cheap enough to give away.

## D21 — Language is a device setting, and the model answers in it

**Decision.** The UI speaks English or Hebrew, chosen per device and stored in
local settings; the layout mirrors with `dir`; and the chosen language is sent
to the model so food names and assumptions come back in it too.

**Why per device rather than per account.** It is a preference about a screen,
not a fact about a person. Someone may reasonably want Hebrew on their phone
and English on a shared laptop, and settings are already excluded from sync for
the API key (D14, Q8) — the same box is the right one.

**Why the model too.** Translating the buttons and leaving "Grilled chicken
breast" in English produces a screen that is Hebrew everywhere except the part
the user came to read. The rule appended to the prompt is deliberate about
translating *values only*: a model told simply to "reply in Hebrew" will
helpfully translate the JSON keys as well, and then nothing parses.

**Consequence, accepted.** `mealSignature` identifies a repeatable meal by its
item names, so switching language mid-history splits one breakfast into two
usuals. Recorded as Q12. The fix is a language-independent food identity, which
is the food-database work already parked in the roadmap; a half-version of it
now would be the wrong order.

**Revisit when** a third language arrives (the dictionary is typed so adding one
is a compile error until it is complete, which is the intended cost), or when
food identity stops being a name. **Built in**
`docs/features/hebrew-and-rtl.md`.

