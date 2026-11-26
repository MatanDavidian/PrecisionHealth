# What to eat now: the precision design

**One line:** a suggestion is only as good as the numbers under it. This
document says what Vimetry knows about the person's day and week, how sure it
is of each number, and exactly how those numbers decide whether to offer
anything, how much, and with what explanation.

Status: **design for review, revised 2026-11-26 after the owner's review.**
Nothing here is built yet; what is built is in
[`meal-suggestions.md`](meal-suggestions.md). Phase 1 (§4) is specified to
the level of its acceptance test. The later phases (§5) are separate and
each needs its own approval.

**The architecture does not change.** Vimetry calculates the targets, the
room, the plan, the calorie cap and the protein wanted, and validates every
suggestion against them. The model chooses foods and portions within those
limits, and nothing else.

---

## 1. What "precise" means here

1. **The numbers are the person's.** Their burn as their watch measures it
   (or as their body predicts it), their usual foods and portions, their
   goal. Never a population figure when a personal one exists.
2. **Vimetry does the arithmetic; the model chooses the food.** Every number
   that decides something is computed by rules in the app, testable and
   explainable, and every number the model returns is checked again.
3. **It never claims more precision than it has.** A decision does not flip
   on a difference smaller than the noise (§4.2). Estimated portions are
   labelled as estimates (§4.7). A day that may be incomplete is shown as
   such and the person decides (§4.6).
4. **It is honest when the answer is "nothing".** No compensating, no
   fasting advice, no pushing food. An optional light snack is offered, never
   urged.

## 2. What Vimetry knows, and how well

| Input | Source | How sure | Built? |
| --- | --- | --- | --- |
| **Eaten, today and earlier** | Logged meals: by hand, photo, words, repeated; days set in one tap | Typed by hand: sure. Estimated portions (photo, words, a suggestion): about ±20% each, **confirmed or not** (§4.7). A day set in one tap: a rough estimate by design | ✅ |
| **A day possibly incomplete** | Intake under 50% of the day's target | Unknown until the person says (§4.6) | ◻ Phase 1 |
| **Burn on past days** | The watch's daily total (`TOTAL_ENERGY`), or a number typed on Today | A wrist watch can be off by 20% or more, but consistently, so day-to-day differences mean something. A day under 60% of the usual is a watch that stopped counting and is not believed | ✅ |
| **Usual burn** | The watch's average over the 28 days before the day (5 days or more), else a formula: weight, height, age, sex × how active a day is | Watch: good. Formula: ±10–15% | ✅ |
| **Burn today so far** | The watch's running total and active calories, as synced | Partial until the day ends | ◻ Phase 3 |
| **Training today** | Workouts: kind, minutes, active calories | Kind and length: sure; active calories: the watch's estimate | ✅ shown and sent; ◻ counted (Phase 3) |
| **Goal** | Settings → Goals: the weight (lose, keep, gain, none) and what else (muscle, fat, fitness) | Sure | ✅ |
| **Weight trend** | Weigh-ins | One weigh-in: noisy. A trend over weeks: meaningful | ◻ Phase 5 |
| **Usual meals and times; sleep; preferences** | Meals of the last 60 days; the watch's sleep; Settings | Good after two weeks of logging | ✅ (sleep ◻) |

## 3. The worked example: the owner's Thursday

**The person.** The watch has recorded 25 days, averaging 2,410 kcal burned
a day. Goal, in Settings → Goals: *Your weight: Lose weight*, with *Also
working on: Build muscle, Lower body fat, General fitness*. "Lose weight"
together with "Lower body fat" or "Build muscle" is **lose fat, keep
muscle**, which plans **350 kcal a day under the burn**
(`leadObjective`, [`several-goals.md`](several-goals.md)). Thursday's
target is therefore 2,410 − 350 = **2,060 kcal**, protein 145 g.

**The week, Sunday 22 to Thursday 26 November 2026:**

| Period | Eaten | Against | Result |
| --- | --- | --- | --- |
| **Sun 22 – Wed 25 Nov** | 8,533 | 10,170 burned, as the watch recorded each day | **1,637 below estimated expenditure** |
| Sun 22 – Wed 25 Nov | | The planned deficit, 4 days × 350 = 1,400; so the 4 days' budget is 10,170 − 1,400 = **8,770** | **237 below target** |
| **Thu 26 Nov** | 2,386 | Thursday's target, 2,060 | **326 above target** |
| **Sun 22 – Thu 26 Nov** | 10,919 | 8,770 + 2,060 = **10,830** | **89 above plan** |

The week view ("you ate 1,637 less than you burned") answers *did I eat
less than I burned, Sunday to Wednesday?* The card ("89 above plan")
answers *am I on my plan, Sunday to Thursday?* Both stay; from Phase 1 each
says its own period and question (§4.8).

**What the card should have said** (Phase 1): the 5 days are *within plan
range* (±325, §4.2); today is 326 above target with protein 11 g short;
nothing is urged, and an optional *"Hungry? Suggest a light protein
snack"* is offered, at most 120 kcal, which would take the 5 days to +209,
still within range.

## 4. Phase 1: honest numbers

### 4.1 The period and its days

Phase 1 keeps the calendar week, Sunday to today, both for reporting (the
week view) and for suggestions. The rolling seven days are Phase 2 (§5.1).

- **Included days:** today, and each earlier day of the week that has food
  on it, has targets, and has not been marked incomplete (§4.6).
- **A day's budget:** its real burn plus the goal's daily balance, when a
  burn was recorded and believable and the calories are not the person's
  own number; otherwise its target (built, `weekSoFar`). **Today's budget
  is today's target**: today's burn is not finished.
- **The balance:** eaten minus budget, summed over the included days.
  Negative is below plan.
- **Too few days:** with fewer than 3 included days, today among them, the
  week is not used. Decisions are made on today alone, and the card says
  *"Too few complete days this week: today's targets only."*
  (Provisional threshold.)

### 4.2 Plan range: a tolerance, not a cliff

```
range  = ± max(150 kcal, 3% of the included days' budget)
status = below plan range   when balance < −range
         within plan range  when −range ≤ balance ≤ +range
         above plan range   when balance > +range
```

| Example | Budget | Range | Balance | Status |
| --- | --- | --- | --- | --- |
| The owner's Thursday | 10,830 | ±325 | +89 | **within** |
| The same, after a 120 kcal snack | 10,830 | ±325 | +209 | **within** |
| A flat 10,000 | 10,000 | ±300 | +89 | within |
| Today alone (too few days), 2,060 target | 2,060 | ±150 | +326 | above |
| Two days, 4,120 budget | 4,120 | ±150 (3% is 124) | −180 | below |

### 4.3 What the card offers

Unchanged from what is built, when **today has room** (100 kcal or more
after the usual meals still to come): suggestions that fill it, or *wait
for dinner*. Changed, when **today's calories are used** (under 100 left,
or over) and **protein is short by 10 g or more**:

| Plan range | Main message | Action |
| --- | --- | --- |
| **Below** | "The 5 days are 450 below plan: a protein snack fits." | **Suggest a protein snack**: up to min(250, the room below range), as built |
| **Within** | "Today is 326 above target; the 5 days are within plan range (+89 of ±325)." | **Hungry? Suggest a light protein snack**: optional, up to **120 kcal** |
| **Above** | "Better to stop for today: the 5 days are 400 above plan." | **Hungry? Suggest a light protein snack**: optional, up to **120 kcal** |

- **Weekly protein informs, never hides.** When the week's protein is ahead
  of its targets, the explanation adds *"This week's protein is 64 g ahead,
  so today's 11 g can also wait"*, and the action stays. (Today's
  "protein ahead: stop" rule is removed.)
- **Protein reached:** nothing is offered, as built.
- **The light action is an offer, not advice to eat.** Its wording is
  conditional ("Hungry?") and it is a secondary button, never the primary.

### 4.4 The projection

Before asking, the light action shows what it would do: *"Up to 120 kcal:
the 5 days would be at most +209, still within plan range."* Each returned
suggestion's fit line shows its own projection: *"+118 kcal today · protein
149 of 145 g ✓ · 5 days +207, within plan range"*. The projection uses the
same balance and range as §4.2, plus the suggestion's own calories.

### 4.5 Validation enforces the stated cap

The cap the card states is the cap the validator enforces: a suggestion
whose recomputed total is above `maxKcal` is **rejected**, with no
tolerance (today a 10% + 20 kcal allowance exists: removed). The cap is
stated once, sent to the model as `maxKcal`, and checked once. For the light
action, `maxKcal` is 120 (the existing `LIGHT_SNACK_MAX_KCAL`).

### 4.6 Possibly incomplete days

- **Flag:** an earlier day of the period with intake under 50% of its target,
  not set in one tap, is shown as *possibly incomplete*.
- **Ask:** the card lists it under the period: *"Tue 24 Nov: 900 kcal logged.
  Complete? Yes · No, I didn't log everything"*. The same question is on that
  day in Nutrition.
- **Answered "complete":** included, the flag goes.
- **Answered "incomplete":** excluded from **both** intake and budget, as an
  empty day is.
- **Not answered:** included, and shown flagged. *(Provisional: while a
  flagged day is unanswered, the below-range protein snack is limited to the
  light 120 kcal, so an unlogged dinner cannot buy a 250 kcal snack.)*
- **Counted days are shown:** *"Sun 22 – Thu 26 Nov · 5 of 5 days counted"*,
  or *"4 of 5 days counted: Tue 24 marked incomplete"*.
- **Stored** as a small record per day (day, complete or incomplete, when),
  append-only like every other record (D4), synced with the account and
  carried into an account at sign-in.

### 4.7 Estimated portions stay labelled

A food whose numbers came from a model (a photo, words, a suggestion) is an
**estimated portion**, and stays one after the person confirms it:
confirming says *I ate this*, not *these grams were weighed*. The record
chain already keeps where a confirmed food came from (`supersedes` points at
the estimate), so the label is derived, not stored again.

On the card: *"About 2,386: 13 foods are estimated portions."* In Phase 1
this is a label only; it does not change any decision.

### 4.8 The card, revised (Phase 1)

```
Today's targets                                    How?
2,386 of 2,060 kcal                           326 over
[bars]
Lose weight + Lower body fat: 350 kcal a day under the 2,410 you burn,
from your watch (25 days).
About 2,386: 13 foods are estimated portions.
──────────────────────────────────────────────────────────
Thu 26 Nov · 326 kcal above target · protein 11 g short

Sun 22 – Thu 26 Nov · 5 of 5 days counted
  Against your plan     +89   within plan range (±325)
  Protein               108 g behind
  Fat                   37 g over
  Carbs                 171 g over
  Why two numbers? ▸   (opens §3's table for this week:
                        Sun 22 – Wed 25: 1,637 below estimated expenditure,
                        237 below target after the planned 1,400;
                        Thu 26: 326 above target)

[ Hungry? Suggest a light protein snack ]  up to 120 kcal:
the 5 days would be at most +209, still within plan range.
```

Hebrew follows the same structure, with the dates as *"א׳ 22 – ה׳ 26 בנוב׳"*
and *"בטווח התוכנית"* for *within plan range*. All copy is written in both
languages at implementation.

### 4.9 What changes in the code (for the implementation step)

- `domain/suggestions.ts`: `planRange(balance, budget)`; `weekSoFar` returns
  the included days, their budget and the excluded ones; `suggestPlan` gains
  the within/above/below logic of §4.3 and drops the protein-ahead stop;
  `fitOf` projects the balance.
- `ai/validate.ts`: the cap with no tolerance.
- A day-completeness record: domain type, both repositories, the
  Supabase table (a migration), the export, adoption at sign-in.
- `SuggestMeals.tsx`: the period line with dates, counted days, plan range,
  "Why two numbers?", the light action with its projection, the incomplete-
  day question. `DailyTargets.tsx`: the estimated-portions line.
- No change to the prompt's job, the server, or what the model decides.

### 4.10 Phase 1 acceptance test

A browser test replays the owner's Thursday, with numbers seeded to match
§3 exactly (28 days of watch burns averaging 2,410 before Thursday, Sunday
to Wednesday burning 10,170 and eating 8,533; Thursday 2,386 eaten, protein
134 of 145) and the model stubbed:

1. **The card:** shows *Thu 26 Nov* and *Sun 22 – Thu 26 Nov*, *5 of 5 days
   counted*, *+89*, *within plan range (±325)*, and *"Why two numbers?"*
   with 1,637 / 1,400 / 237 / 326.
2. **The optional snack, even with weekly protein ahead:** the same test
   with Sunday to Wednesday's protein raised so the week is ahead still
   shows *Hungry? Suggest a light protein snack*, with the protein-ahead
   sentence as explanation only.
3. **The validator:** the stubbed model returns a 120 kcal snack and a 121
   kcal one; only the 120 kcal one is shown.
4. **Logging:** *Log it* on the 120 kcal snack; the card shows *+209,
   within plan range*.
5. **Undo:** the card returns to *+89*.

Unit tests cover every row of §4.2 and §4.3, the incomplete-day rules of
§4.6, and the projection.

## 5. Later phases, each separate

### 5.1 Phase 2: a rolling seven days for suggestions

Suggestions use **the last seven days** (today and the six before); the week
view keeps **calendar weeks** for reporting. The card names its period with
dates (*"Fri 20 – Thu 26 Nov"*), so the two never look like the same thing.
Removes the Sunday blind spot, when a calendar week has one day.

**Daily targets stay stable after an overage.** An overage changes what the
card offers and says, never the next days' targets: no "eat less tomorrow
to make up".

### 5.2 Phase 3: today's training counted

```
extra   = today's active calories so far − the usual day's active calories
credit  = 50% of extra, when extra > 0
room    = today's target − eaten + credit
```

- **50% to start**, of activity above the baseline only. Provisional.
- **Compare equivalent measurements:** active calories against the usual
  *active* calories, from the same source (the same watch); never a watch's
  active figure against a formula's total.
- **No double counting:** the usual burn already includes a usual day's
  training, so only the extra counts; once the day is over, its real burn
  replaces target and credit (as past days do now), and the credit is not
  added again.
- **Manual targets preserved:** a calorie target the person typed in gets no
  credit; it is their number.
- **Never downwards during the day:** a quiet morning is not a quiet day.
- **Shown:** *"62 min of strength training, 380 kcal more than usual: 190
  counted."*

### 5.3 Phase 4: better food choices

- **Protein per sitting:** about 0.3–0.5 g per kg (25–40 g for most). A
  70 g gap late in the evening is not closed in one snack; the card says
  what is closed now and that the rest is for tomorrow.
- **Fat floor:** a week averaging under 0.5 g of fat per kg a day gets
  suggestions with some fat.
- **Carbs by training:** after 60 minutes or more of endurance training,
  carbs are part of the answer; after strength, moderate; on a rest day,
  modest.
- **Before sleep:** within 3 hours of the usual bedtime (from the watch's
  sleep), at most 400 kcal, light and slow protein.

### 5.4 Phase 5: learning the real burn from the weight (deferred)

```
real burn ≈ average eaten − (smoothed weight change in kg × 7,700) ÷ days
```

Offered only when **all** of these hold, all provisional:

- at least **28 days** of sufficiently complete data (logged days, not
  marked incomplete, and regular weigh-ins);
- a **persistent discrepancy of at least 10%** from the burn in use, over
  that whole span, not one week;
- **explicit approval** from the person: *"Your weight trend says you burn
  about 2,250 a day, not 2,410. Use 2,250 for your targets?"* Never switched
  silently, and undoable.

## 6. Who decides what

| Decision | Who |
| --- | --- |
| The period, its included days, the balance, the plan range | **Vimetry** |
| Whether to offer anything, the plan, the calorie cap, the protein wanted | **Vimetry** |
| Which foods, and how much of each, within the cap | **The model** |
| Whether the model's numbers are real, and within the stated cap | **Vimetry** validates; anything outside is rejected |
| Preferences (diets, foods to avoid) | Rules sent to the model, and checked where words allow |

## 7. What Vimetry never does

- Never suggests making up for overeating by skipping meals or fasting, and
  never lowers the next days' targets because of an overage.
- Never goes below the floor (1,200 / 1,500 kcal a day).
- Never suggests supplements or medication; never comments on the body.
- Never pushes food: room is an offer, and the light snack is optional.

## 8. Open questions

1. The **range**: ±max(150 kcal, 3%), as specified here?
2. **Too few days:** under 3 included days uses today alone?
3. **Unanswered incomplete days:** included but limiting the snack to 120
   kcal (§4.6), or excluded until answered?
4. Phase 3's **50%** and Phase 5's **28 days / 10%** are provisional, to
   revisit with real data.
