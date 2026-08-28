# Feature spec — your weight, your target, and what you burned

**One line:** three numbers you can type on the Today screen — current weight,
a target weight, and the calories you spent in a day — so the dashboard is
useful before any watch is connected to it.

Status: **built** (Aug 2026). Stands in for the Garmin slice, which is blocked
on something outside our control (§4).

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

## 4. Why not Garmin

The plan was to import this from a watch. Garmin's Health API is
**partner-approval only**, and as of 2026 new applications appear to be closed
— the access-request form has been removed with no published reopening date. So
the automatic path is not available to build against, however much we would
prefer it.

What the data would look like is known and unchanged: Garmin's daily summaries
carry `ActiveKilocalories`, `BmrKilocalories` and `CalendarDate`, which map
cleanly onto `ACTIVE_ENERGY` observations. When a route opens, it becomes an
adapter behind the same write path this feature already uses — the same shape
as BYOK becoming a server proxy for the estimator (D14).

The three routes, for whoever picks this up:

- **File import.** Garmin Connect exports daily summaries; no approval, no
  cost, but manual.
- **The Health API.** The real thing — OAuth plus webhook pushes to an edge
  function. Blocked on approval.
- **An aggregator** (Terra, Vital, Rook). Works today and covers Apple Health,
  Samsung and Google Fit in one go, which is the rest of the wish list. Costs
  money per user and routes health data through a third company.

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
