# Feature spec — quick-set a day

**One line:** a day with no meals can be set in one tap to less than usual,
the usual, more than usual, or a number of calories, from the week view and
from Today.

Status: **designed, not built** (2026-11-17). Epic 6 in
[`../ROADMAP.md`](../ROADMAP.md). Mock-ups of the four screens below were made
the same day as a clickable design canvas, kept with the owner.

---

## Why

"Fill from your average" already exists in the week view (`GapsCard`,
`patternFill.ts`): a day nobody logged sits at zero, a zero drags every
average and graded week down, and the person knows they ate. It offers one
answer, the average. People know more than that: "I ate a lot that day",
"it was a light day", "about 1,800". This turns one button into four.

It is also where the daily reminder would lead (`reminders.md`): at 22:30,
with nothing logged, the fastest honest answer is a tap on Today.

## What it does

### The four choices

| Choice | Calories | Decided |
| --- | --- | --- |
| **Less** | the average × 0.85 | ±15%, the owner's choice, 2026-11-17 |
| **Average** | the average, as today | |
| **More** | the average × 1.15 | |
| **A number** | what the person types, with − and + in steps of 100 | |

Protein, carbs and fat follow the person's usual mix: the average day's
macros scaled by the same ratio as the calories. A number of 1,800 against
an average of 1,920 scales every macro by 1,800 / 1,920.

Each choice shows its result before anything is written ("−15% · 1,630
kcal"), and the main button says what will happen ("Fill both: 1,630 kcal
each"), so nobody has to work out what "less" means.

### Where

1. **The week view's gaps card** (mock-up 1 and 2): the choice applies to
   every gap listed. "Average" is preselected, so one tap still does what it
   does today.
2. **The Day tab, for a past day** (mock-up 5): a day with no meals,
   opened in the Day tab, gets the same card ("Nothing logged on Sunday"),
   with "Add the meals instead" under the main button.
3. **Today, for today** (mock-up 3): a card appears when today has no
   meals and it is **16:00 or later** (the start of the reminder window).
   Earlier in the day an empty day is not a gap, only a day in progress.
   "Log meals instead" sits under the main button, because logging is
   always the better answer.
4. **After setting** (mock-up 4): the day's totals are labelled
   "Estimated", the meal reads "The day, from your average · an estimate:
   nobody logged it", with Undo for a few seconds, then "Change it" and
   "Remove the estimate".

### Rules that do not change

- **Still an estimate.** The meal is written the way a filled day is today
  (`buildPatternFilledDay`): marked as filled, never confirmed.
- **Never evidence.** Filled days stay out of every future average
  (`typicalIntake`, rule 1), whichever choice made them. A specific number
  does not teach the average anything.
- **A real meal wins.** Logging a meal on a filled day replaces the
  estimate, as today.
- **Too little history: a number only** (mock-up 6; decided by the owner,
  2026-11-17). With fewer than three logged days there is no average to
  scale, so "Less", "Average" and "More" are not shown. The card offers the
  number field alone, calories only (protein, carbs and fat stay blank:
  there is no usual mix to go by), and says why the other three are
  missing and how many days are logged so far.

## Code design

- **Domain** (`patternFill.ts`): a `scaleIntake(typical, ratio)` that
  multiplies calories and macros, and a `ratioFor(choice, typical, kcal?)`.
  The filled meal records which choice made it (`less`, `average`, `more`,
  `number`), so the label can say "your average −15%" and an export can
  tell the four apart.
- **Data** (`useHealthData.ts`): `fillDayFromPattern` takes the choice; one
  write per day, as now.
- **Screens:** `GapsCard` gains the four-way choice and the number field;
  a new `SetTodayCard` on Today reuses the same choice component. Both
  languages; the choice component is checked right to left.
- **Tests:** the arithmetic in unit tests (each choice, rounding, a number
  below zero refused); browser tests for each place, for Undo, and for a
  real meal replacing a set day; the accessibility scan on both cards.

Size: about 1–2 days.
