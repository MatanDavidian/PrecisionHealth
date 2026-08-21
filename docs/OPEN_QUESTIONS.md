# Open questions and assumptions

Decisions made to keep a slice moving, that are genuinely yours to rule on.
Most are live in the code right now — the code links back here — so changing
your mind is an edit, not an archaeology exercise. Ones whose **Files** say
*(planned)* belong to the slice-2 spec and bind when it is built.

Format: **Q** the question · **Assumed** what the code does today · **Cost of
being wrong** what it takes to change · **Needs deciding by** the slice where it
stops being cheap.

---

## Q1 — Which timezone stamps a new record: the device or the profile?

**Assumed.** The **device's** current zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
Where you physically are when you eat is what decides which day the meal belongs
to, and the device knows that; a profile setting goes stale the moment you fly.

**The wrinkle.** A phone left on the wrong zone, or a laptop that never updates,
silently files records against the wrong day. There is no way to tell that from
the data afterwards.

**Alternative.** Ask on arrival ("You seem to be in Berlin — log in Berlin
time?"), which is what Garmin does, or let the profile win and treat the device
as a suggestion.

**Cost of being wrong.** Low now, high later: records already written keep the
zone they were stamped with (by design, D7), so a change affects new records
only — but a year of mis-stamped history cannot be repaired without knowing
where you actually were.

**Needs deciding by.** Slice 4 (Garmin import), where the device supplies its
own zone and the two can disagree.
**Files.** `src/data/newRecords.ts` (`deviceZone`).

## Q2 — Where do nutrition numbers come from?

**Assumed.** Typed by hand — name, grams, kcal and macros, every time. There is
no food database.

**The wrinkle.** Nobody sustains manual macro entry. This is fine for slice 1
because the point is proving the write path, but as a product it is a dead end
without either a food database (USDA FoodData Central, Open Food Facts) or the
photo flow from slice 3.

**Cost of being wrong.** Low. `FoodItem` already carries everything a database
would fill in; a lookup becomes a new provenance source, not a schema change.

**Needs deciding by.** Answered by resequencing: the photo flow IS slice 2
(see `features/photo-meal-logging.md`). The AI estimate is the fast path; a
database remains the correction path — and the only credible route to
micronutrients (Q9).
**Files.** `src/ui/components/MealForm.tsx`.

## Q3 — Are aggregate rows append-only? · **settled: versioned meal records**

**Decided (Aug 2026).** Meals stop being rewritten. Every edit appends a NEW
meal record sharing the same `mealId` and carrying an incremented `version`.
The UI shows the highest version. Two records at the *same* version with
different content is, by definition, two devices having edited the same base —
that is raised as a conflict, the user picks, and their choice is saved as the
next version.

**Why this shape.** It restores the property that makes everything else sync
safely (D4): each device only ever ADDS records, so syncing is a union and
nothing can be clobbered. It also reuses the pattern already on screen for
observations (D6) — surface the disagreement, let the human settle it, record
the answer as data. One idea, applied twice, rather than two mechanisms.

**The tradeoff, accepted deliberately.** Versioning at the meal level means two
devices editing *different items of the same meal* still collide, even though
those edits are mergeable in principle. Item-level append would avoid that but
needs per-item version chains and a merge rule. For a family app where two
people rarely edit the same meal in the same minute, the false-conflict rate is
low and the simplicity is worth more. Revisit if it turns out to fire often.

**Still to design when it is built:** whether old versions are pruned (history
grows per edit), and whether `version` is enough on its own or needs the
device id alongside it to explain *who* diverged.

**Must land before sync exists**, not after — after, it is a live data-loss bug.
**Files (planned).** `src/domain/nutrition.ts`, `src/domain/corrections.ts`,
`src/data/idb/schema.ts`.

## Q4 — What is a "day" for a user who is awake past midnight?

**Assumed.** Local midnight. A 01:00 meal counts toward the day that just
started, matching Garmin and Apple Health so imported daily totals line up
without a fudge factor.

**The wrinkle.** It is not how people experience a late dinner. Someone eating
at 01:00 thinks of it as part of the evening that just ended, and their protein
total for "yesterday" will look wrong to them.

**Alternative.** A per-user day boundary (04:00 is the usual choice). The code
is ready for it — `DAY_BOUNDARY_HOUR` is one constant threaded through
`dayKey` — but the moment it becomes a setting, every stored `day` index needs
recomputing.

**Cost of being wrong.** Low now, high after real data exists: the derived day
is persisted as an index (D7), so changing the boundary means a migration over
every record.

**Needs deciding by.** Whenever you first notice it annoying you. Worth
deciding before slice 4 fills the database with imported days.
**Files.** `src/domain/time.ts` (`DAY_BOUNDARY_HOUR`).

## Q5 — Is the seeded sample day helping or lying? · **partly settled**

**Settled for the cloud (Aug 2026).** Adoption uploads only records with
generated ids, so the sample day stays in the browser and never enters an
account. The distinction was free: seeded rows have hand-written ids
(`meal-breakfast`), everything real gets a UUID.

**Still open locally:** signed out, sample data still sits alongside yours with
no marker and no way to clear it short of deleting the database.

---

### Original note

**Assumed.** A fresh install seeds a full sample day onto **today**, including a
deliberate two-source weight conflict and an unconfirmed AI estimate, so both
paths are visible immediately.

**The wrinkle.** It is fake data indistinguishable from real data once you start
logging alongside it. There is no "this is a demo" marker, and no way to clear
it beyond deleting the whole database.

**Alternative.** Mark seeded records (a `DEMO` provenance source, or a flag on
the row) and offer "clear sample data" — cheap now, awkward once the store has a
year of real records mixed in.

**Cost of being wrong.** Low, and entirely front-loaded: decide before you start
logging real meals into it.

**Needs deciding by.** Before slice 3 puts this data in the cloud.
**Files.** `src/data/index.ts` (`ensureSeeded`), `src/data/mock/seed.ts`.

## Q6 — One user, hardcoded

**Assumed.** Everything reads `DEMO_USER_ID`. There are no accounts, and the
repository interfaces take a `userId` that only ever has one value.

**Why it is fine for now.** The interfaces are already user-scoped and the
IndexedDB indexes are all `[userId, day]`, so real auth populates a value that
is already threaded everywhere rather than adding a parameter to every method.

**Cost of being wrong.** Low — this is the one assumption the design already
anticipates.

**Needs deciding by.** Slice 3, by definition.
**Files.** `src/data/mock/seed.ts` (`DEMO_USER_ID`), `src/ui/useHealthData.ts`.

## Q7 — No delete, anywhere

**Assumed.** You can add a meal and correct an estimate, but you cannot delete
anything. D4 says records are append-only, and nothing in the UI removes one.

**The wrinkle.** "I logged this twice by mistake" is the single most common
correction in any food tracker, and right now the only remedy is confirming a
zeroed correction over it, which is not something a person will discover.

**Alternative.** A `retracted` provenance kind that supersedes without
supplying a replacement value — append-only, still auditable, and it reads as
"delete" in the UI.

**Cost of being wrong.** Low to fix, but it is a visible gap the first time you
mistype a meal.

**Needs deciding by.** Slice 1 follow-up — realistically the next thing you will
want.
**Files.** `src/domain/corrections.ts`.

## Q8 — Is an API key in browser storage an acceptable risk?

**Assumed.** Yes, for a single-user app on personal devices (D14). The key is
stored in IndexedDB, sent only to the provider, never synced. The Settings
screen says this in plain language and recommends a dedicated, spend-capped
key.

**The wrinkle.** Anything that can run script in this origin can read it. The
surface is small — static site, no third-party scripts — but a shared or
public computer makes it a bad idea, and nothing currently warns about that.

**Alternative.** Slice 3's server proxy holds a managed key and BYOK becomes
opt-in. Session-only storage (re-enter per visit) is a middle ground.

**Cost of being wrong.** Bounded by the key's spend cap, which is why the
Settings copy pushes one.

**Needs deciding by.** Revisit at slice 3 when the proxy exists.
**Files (planned).** `src/ai/`, Settings screen.

## Q9 — Vitamins from a photo?

**Assumed.** No. Macros (+fiber) only. A photo does not carry micronutrient
information — fortification, soil, variety and preparation are invisible — and
shipping confident-looking vitamin numbers would break the product's honesty
rules (D13, provenance principles).

**The credible path.** Photo → food *identity* → micros from a food database
(USDA FDC / Open Food Facts). That is a food-database feature, not a better
prompt, and it is parked in ROADMAP "Later".

**Cost of being wrong.** None now; `Nutrients` extends compatibly when the
database lands.

**Needs deciding by.** Whenever the food database is scheduled.

## Q10 — How long do meal photos live? · **settled: they are not stored**

**Decided (Aug 2026, product call).** Meal photos are never persisted — not in
the app, not in any future backend. The photo lives in memory for the flow, is
sent to the provider once, and is discarded on save or cancel. The AIInference
row keeps photo *metadata* (dimensions, bytes, SHA-256) so the audit trail
still has a shape; the only copy that outlives the flow is whatever the
provider retains under its own API data policy.

**Deliberately forgone.** Re-running old photos through better future models,
and thumbnails as a memory aid in the log. Judged not worth a growing archive
of food photos — privacy first, and it removes this feature's storage cost
from slice 3 entirely.

**Unchanged.** `Attachment` and `Meal.photoId` stay in the domain for
body-progress photos and lab documents, where persistence is the point.
**Files (planned).** Spec §3 (scope), §4 (data flow), §7 (privacy).

## Q11 — What does "save my data as JSON on the phone" actually mean?

**Assumed.** Settings now offers three destinations — this browser (working),
a JSON file, and your own server — but only the first is implemented. The
other two record intent: the choice persists, the screen says plainly that
data is still going to browser storage, and the preference is already in place
when the implementation lands.

**The platform constraint, worth knowing before planning around it.** A web
app cannot silently write files to a phone. The File System Access API is
desktop-Chrome only; iOS Safari has nothing equivalent. So "JSON on the
device" can realistically be:

- a **download** the user saves and later re-imports (works everywhere, manual,
  and the file is a static snapshot that goes stale immediately);
- the **origin-private file system**, which is invisible to the user and lives
  in the same storage bucket that clearing browsing data wipes — so it solves
  nothing the current store does not;
- a **share-sheet export** on iOS, which is a download with better ergonomics.

None of those is a live sync. If the actual goal is "my data survives and my
phone and laptop agree", that is the server option, not the file option.

**What the JSON file IS good for:** a backup and an escape hatch. Everything
this app holds is a handful of small JSON documents, so an export is cheap to
build and removes the "clearing browser data erases it" risk (Q10's
neighbour). Worth building on its own merits, just not as a storage backend.

**Cost of being wrong.** Low. The repository seam (D3) means each destination
is an adapter; the setting already exists to select one.

**Needs deciding by.** Slice 3, which is the server option under a different
name.
**Files.** `src/data/repositories.ts` (`StorageTarget`),
`src/ui/screens/Settings.tsx`.

---

## Smaller assumptions, noted without ceremony

- **Latency is unmodelled.** IndexedDB is fast enough that no screen shows a
  spinner beyond first load. Slice 2 adds a network and this stops being true.
- **No date picker.** Every screen shows today. Viewing yesterday needs one, and
  `useDay(day)` already takes the parameter.
- **Errors are unhandled past the storage gate.** A failed write logs nothing
  and shows nothing; the only handled failure is IndexedDB being unavailable
  entirely (private browsing).
- **Goals are seeded, not editable.** 145 g protein and 10,000 steps are
  hardcoded in the seed. Slice 5 owns making them real.
- **Body fat is stored as `%`,** which is a ratio, not a unit in the dimensional
  sense — `convert` treats it as its own dimension. Harmless, slightly impure.
- **`suggestSlot` uses fixed hour boundaries** (11 / 16 / 22) rather than
  learning from your logging pattern.
- **The estimator model name is a setting, not a constant** — vision model
  names churn too fast to hardcode; the spec picks a default at build time.
- **One estimator provider (OpenAI) at launch.** The port makes a second
  provider an adapter, but CORS behaviour must be verified per provider before
  offering it.
