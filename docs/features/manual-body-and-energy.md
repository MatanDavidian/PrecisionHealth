# Feature spec — your weight, your target, and what you burned

**One line:** three numbers you can type on the Today screen — current weight,
a target weight, and the calories you spent in a day — so the dashboard is
useful before any watch is connected to it.

Status: **built** (Aug 2026). Stands in for the Garmin slice — the Health API
is closed to new applicants, but Connect IQ is a way in for most of what we
wanted, with sleep and HRV the exceptions (§4).

---

## 1. Why by hand first

The Today screen was showing weight, body fat and active calories from seeded
sample data, with no way for a real person to put real numbers there. Every one
of them was waiting on a device import that, it turns out, we cannot build yet.

Typing them is not a placeholder for the import. It is the thing that makes the
import *safe*: a hand-entered figure is an ordinary observation with `USER`
provenance, so when a watch eventually sends its own number for the same day,
the two meet in the existing precedence order (D6) and disagreement becomes a
question rather than a silent overwrite. That path is now exercised by real
data instead of only by the seeded conflict.

## 2. What was already there

Almost all of it, which is the point of having modelled the domain first:

| Needed | Already existed |
|---|---|
| A weight measurement | `WEIGHT` observation code |
| Calories burned | `ACTIVE_ENERGY`, with a 50 kcal conflict tolerance |
| A target | `Goal`, whose `GoalMetric` includes every `ObservationCode` |
| Precedence when sources disagree | `resolveEffective`, `CONFLICT_TOLERANCE` |
| Unit safety | `toCanonical` at the edge (D8) |

What was missing was a write path and somewhere to tap. `ObservationRepository`
already had `add`; `GoalRepository` did not, and now does.

## 3. The decisions worth stating

**A goal appends; it never edits.** Changing your target from 78 to 75 writes a
new goal — the old one stays readable, because what you used to be aiming for is
part of the story (D4). `currentGoals` picks the newest per metric, ordered by
when it was *recorded* rather than when it starts, since two goals can
legitimately start on the same day: you set one, thought better of it, and set
another an hour later.

**The direction is derived, not asked.** Nobody thinks of a target weight as
having a direction; they think "I want to be 75". So `directionToward` reads it
off the current weight — a ceiling if you are above it, a floor if below.
`REACH`, the third option, would demand hitting the number to within a gram,
which is not a goal anyone could attain.

**A past day is stamped at midday, local to the zone it is recorded in.** Twelve
hours clear of either boundary, so nothing short of changing timezone moves it
onto a neighbouring date, and it invents no detail — claiming yesterday's weight
was taken at 07:14 would be making things up. It is deliberately *not* midday
everywhere: no instant shares a date worldwide, since the globe spans
twenty-six hours of clock. It does not need to, because the record carries its
own zone (D7) and that is what it is read back through.

> A test asserted the opposite of that last paragraph and failed, which is how
> the paragraph got written. The original comment claimed the timestamp "lands
> squarely inside the date in any timezone" — it does not, and cannot.

**Entering by tapping the row, not a pencil icon.** These are the two figures
most likely to be entered daily on a phone, and hunting for a 26px target to do
a routine thing is the wrong trade. Editing happens in place rather than in a
modal: it is a five-second job, and the surrounding numbers are the context you
are entering against.

## 4. Garmin: what is reachable, and what is not

The plan was to import this from a watch. That is still the plan, but by a
different door than the one we first tried.

### The Health API is shut; Connect IQ is not

Garmin's **Health API is partner-approval only**, and as of 2026 new
applications appear to be closed — the access-request form has been removed
with no published reopening date.

**Connect IQ is a separate route and needs no such approval.** A Watch App
written in Monkey C runs on the device, reads the same metrics Garmin computes,
and can be sideloaded to your own watch over USB with a developer signing key
that the VS Code extension generates. Publishing to the Connect IQ Store later
is an ordinary store review, not the blocked partner application.

### What Connect IQ can and cannot supply

Checked against Garmin's Connect IQ documentation for the Forerunner 265. The
right-hand column is the API that carries it.

| Metric | Connect IQ | Where |
| --- | --- | --- |
| Calories, today (running) | yes | `ActivityMonitor.getInfo().calories` |
| Calories, completed days | yes | `ActivityMonitor.getHistory()` |
| Steps, distance, active minutes | yes | `ActivityMonitor` |
| Heart-rate history | yes | `ActivityMonitor` / `SensorHistory` |
| Resting HR, 7-day average | yes | `UserProfile.Profile` |
| Stress, current | yes | `ActivityMonitor.Info.stressScore` |
| Stress history | yes | `SensorHistory.getStressHistory()` |
| Body Battery history | yes | `SensorHistory.getBodyBatteryHistory()` |
| Recovery time | yes | `ActivityMonitor.Info.timeToRecovery` |
| Respiration rate | yes | `ActivityMonitor.Info.respirationRate` |
| VO₂ max, running and cycling | yes | `UserProfile.Profile.vo2maxRunning` |
| **Sleep duration** | **no** | not exposed |
| **Sleep stages, sleep score** | **no** | not exposed |
| **Nightly HRV / HRV status** | **no** | no public equivalent |
| **Training Readiness** | **no** | not exposed |

Body Battery and stress history sit on `SensorHistory`, a different surface from
`ActivityMonitor` with its own device gating — not the same call.

So Connect IQ covers **Activity and Training** and most of **Wellness**, and
leaves **Recovery incomplete**: sleep and HRV, the two inputs that section most
needs, are the two it cannot give. That does not make Connect IQ the wrong
choice; it makes it the first of two adapters rather than the only one. The
second — Apple Health, Health Connect, the Health API if it reopens, or a paid
aggregator — carries sleep and HRV into the same observations. `APPLE_HEALTH`
and `HEALTH_CONNECT` are already members of `DataSource`, so that day needs no
schema change.

### The mapping, and why the old note here was wrong

An earlier version of this section said Garmin's figures map onto
`ACTIVE_ENERGY`. That is the bug `TOTAL_ENERGY` was split out to prevent:
`ActiveKilocalories` is movement only, and using it as total daily expenditure
understates the burn by roughly a basal metabolic rate — about 1500 kcal a day —
which would make every week read as a surplus.

The expected mapping is:

```
ActivityMonitor History.calories  →  TOTAL_ENERGY
```

**Expected, not established.** Connect IQ documents the field as "calories
burned so far for the current day" without saying whether that is active only or
active plus BMR. Confirming it is the POC's job (§4.1), by reading the value and
comparing it against Garmin Connect's Total and Active figures at the same
moment. Nothing should be written to the database on the strength of the
assumption.

### Yesterday is authoritative; today is not written

`getInfo().calories` is by definition a partial day — read it at 21:00 and it is
an undercount. Writing that as the day's expenditure would make the week compare
a full day of eating against a partial day of burning.

So ingestion reads **completed days from `getHistory()`** and writes those. It
writes **nothing at all for today**. There is deliberately no "provisional"
observation state: `summariseWeek` scales the week's aim by `daysWithBurn` and
leaves days with no burn `undefined` rather than zero, so the week already
handles the silence honestly and says how many days it read. A provisional
figure would instead count as a day *with* burn and drag the average down, and
supporting it properly would mean teaching the chart, the summary, the verdict
and the insights payload about a state that resolves itself by morning.

### Writing it: no new mechanism needed

A Garmin reading is `deviceReading('GARMIN', …)` — `source: GARMIN`, `kind: RAW`.
Everything else follows from rules that already exist:

- **Re-syncing a day already imported from Garmin** supersedes the previous
  Garmin record (D4's append-only correction chain). There is no database-level
  uniqueness constraint on `(user, day, metric, source)`, and there should not
  be one.
- **A manual entry and a watch reading for the same day both stay stored.**
  Precedence decides which is effective, and it already favours the human:
  `USER_CONFIRMED` + `USER` outranks `RAW` + `GARMIN`, because kind dominates
  source. Your typed figure wins; the watch fills the days you did not type.
- **A disagreement wider than the `TOTAL_ENERGY` tolerance (100 kcal) surfaces
  as a conflict** for you to resolve, rather than being silently overwritten
  (D6). This is the same machinery the weight card already uses.

The watch cannot supply an IANA zone — Connect IQ exposes the UTC offset and DST
state through `System.ClockTime`, not a canonical zone id. So the payload
carries the local calendar date and the offset, and the **backend supplies the
zone from the user's profile** (D7). Inferring `Asia/Jerusalem` from `+03:00`
would be a guess.

### 4.1 The POC, and the gate it has to pass

Garmin documents `getHistory()` as returning `Array<ActivityMonitor.History>` —
at most seven records, most recent first, supported on the FR265 since API level
1.0. So the gate is narrower than "does this work". Version 0 settles the two
things the documentation does **not** answer:

1. **What `History.calories` corresponds to** — Total or Active, checked against
   Garmin Connect for the same date. This is the load-bearing one.
2. **How many days this watch actually populates**, which sets how far back any
   future import can reach.

The `has` guards stay regardless: a documented contract and a watch in your hand
are not the same evidence, and this is the build whose job is to tell them
apart.

It prints, and saves nothing. It has **no network permission in its manifest** —
not merely no sync code — so there is no phone dependency and nothing ambiguous
about what it is testing. It distinguishes three outcomes that mean very
different things:

```
getHistory UNSUPPORTED      the API is absent on this device
getHistory SUPPORTED, EMPTY the API exists and returned no days
getHistory SUPPORTED, N     the API exists and returned N days
```

and prints **every** day it gets back, not just yesterday, so the dates and
calorie figures can be compared against Garmin Connect side by side — settling
both the active-vs-total question and the day-boundary question at once.

Source is in [`garmin/`](../../garmin). Only if this gate passes is it worth
adding the write adapter, the `Communications` permission and an endpoint.

**Simulator status (Sep 2026):** builds and runs. `getHistory()` reports
SUPPORTED and returns 7 entries; every guarded read works; VO₂ max, resting HR,
stress, respiration and recovery all return values. The numbers themselves are
simulator fiction, so the active-vs-total question is untouched — that still
needs the watch.

It did catch one real bug: `Moment.value()` overflows Monkey C's 32-bit signed
`Number` past 2038-01-19, coming back negative. Harmless in 2026, handled in the
probe, and it settles a design question — **the local calendar date is what
ingestion should send**, with the epoch as a diagnostic beside it. A 32-bit
epoch is not a durable key.

## 5. Tests

- `currentGoals`: newest per metric, same-day ties broken by recorded time, one
  goal per metric rather than one overall, inactive goals ignored entirely.
- `directionToward`: ceiling when losing, floor when gaining, and already being
  there counts as attained rather than as a ceiling to break.
- `buildObservation`: `USER` provenance needing no confirmation, canonical units
  underneath whatever was typed, filed under the day it is *for* rather than the
  day it was typed, and read back through its own zone.
- `instantOn`: midday has eleven hours of slack either way.
- `buildGoal`: canonical target, starts today, fresh id each time so setting a
  new target appends.

Driven in a browser end to end: set a weight, set a goal, set the calories,
reload, all three persist. The typed weight correctly joined the seeded weight
conflict rather than overwriting it — D6 working on real input for the first
time.
