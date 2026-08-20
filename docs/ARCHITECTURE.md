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
`FoodVisionEstimator` port — the same seam pattern as D3 — so a server-proxy
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

**Amends** D9 step 3. **Planned in**
`docs/features/photo-meal-logging.md`.
