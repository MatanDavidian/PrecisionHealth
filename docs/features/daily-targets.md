# Feature spec — daily targets, and the day's progress against them

**One line:** from the goal, the current weight and what the body burns, the
app works out how much to eat each day (calories, protein, carbs, fat) and
shows the day filling up against it.

Status: **built 2026-11-21.** Epic 6 in [`../ROADMAP.md`](../ROADMAP.md)
(6.2, goals and adherence, its first part). Screens as built, in English and
Hebrew: [`mockups/daily-targets/`](mockups/daily-targets/).

---

## Why

The app already knows three of the four things a dietitian would ask: what
someone is trying to do (one of five objectives), what they weigh, and, with a
watch, what they burn. It never put them together. A person logging lunch saw
"1,240 kcal" and had to work out for themselves whether that was a lot. The
question people open a food app to answer is **"how am I doing today?"**, and
that needs a target to be measured against.

## What it does

1. **Works out the targets.** Calories, protein, carbs and fat for a day,
   from the goal, the weight, and either the watch's measured burn or, without
   one, height, age, sex and how active the person is.
2. **Shows the day against them.** On Today, a card at the top: calories
   eaten of the target with what is left, and a bar for each of protein, carbs
   and fat. The Nutrition tab's totals carry the targets too ("96 / 140 g").
3. **Says where the numbers came from,** in one line under the card, and in
   full in Settings, so nothing is a black box.
4. **Asks only for what is missing.** Without a goal, a weight, or a way to
   know the burn, the card says which, and links to the place to set it.

## The arithmetic

All of it in `src/domain/targets.ts`, pure and unit-tested. Rules, never a
model (D13): a target the AI made up would be one nobody could check.

### Calories: what you burn, plus what the goal asks

**Target = daily burn + the objective's daily balance**, the same balance the
week is already graded against, so the day and the week never disagree:

| Objective | Balance | So the target is |
| --- | --- | --- |
| Lose weight | −500 | 500 under the burn |
| Lose fat | −350 | 350 under |
| Build muscle | +250 | 250 over |
| Maintain | 0 | the burn |
| Fitness | none set | the burn, as a guide |

**The burn, in order of preference:**

1. **Measured:** the average of the watch's daily total burn
   (`TOTAL_ENERGY`, the same figure the week uses) over the 28 days before the
   day shown, when at least 5 of them have one. A person's own number beats any
   formula; an average, not a single day, because one long run should not set
   tomorrow's food.
2. **Estimated:** the Mifflin–St Jeor resting rate from weight, height, age and
   sex, times an activity factor: mostly sitting 1.3, on your feet 1.5, very
   active 1.7. With sex not given, the constant halfway between the two.

**A floor.** The target is never below 1,500 kcal for a man or 1,200 for
anyone else, the usual least advised without a professional's supervision. When
the floor applies, the card says so rather than quietly changing the number.

Rounded to 10 kcal: precision past that would be pretending.

### Protein, fat, carbs

- **Protein, by weight and goal:** grams per kilo, higher when losing (to keep
  muscle while eating less) and when building: lose weight 1.6, lose fat 2.0,
  build muscle 1.8, maintain 1.4, fitness 1.6. When losing toward a target
  weight that is lower than now, the target weight is the one multiplied, so a
  heavy person is not asked for an unreachable amount.
  **A protein goal the person set themselves wins** over the calculation.
- **Fat:** 30% of the calories.
- **Carbs:** what is left, in grams (4 kcal each), never below zero.

Grams are rounded to 5.

### Progress

For each nutrient: eaten, target, what is left or how far over, and a state.

- **Calories** are aimed at, not maximised: within 5% either way is **on
  target**; below that, **left** (today) or **under** (a past day); above,
  **over**. Over is shown in ink, never red: one big dinner is information,
  not a failure.
- **Protein** is a floor: reaching it is **reached**, in green.
- **Carbs and fat** are guides with no verdict: a bar and the two numbers.

## UX

### Today, the card at the top of the day

```
┌───────────────────────────────────────────┐
│ TODAY'S TARGETS                           │
│ 1,240  of 2,150 kcal             910 left │
│ ███████████████░░░░░░░░░░░░               │
│                                           │
│ Protein    96 / 145 g   ███████░░░        │
│ Carbs     150 / 235 g   ███████░░░░       │
│ Fat        38 / 70 g    █████░░░░░        │
│                                           │
│ Lose fat: 350 under the 2,500 you burn    │
│ on a typical day (estimated). How?        │
└───────────────────────────────────────────┘
```

- **First thing on the day,** above the other cards: it answers the question
  the screen is opened for.
- **One big number** (calories eaten, display face), the target beside it
  small, what is left on the right. A wide bar, not a ring: a ring needs a
  legend, a bar fills the way a day fills and reads the same right to left.
- **Three quiet rows** for the macros, numbers before bars so they can be read
  without the bars.
- **The basis in one sentence,** with **How?** linking to Settings, where the
  whole calculation is spelled out.
- **A past day** says "Targets on Monday" and "under" instead of "left".
- **States:** calories on target, a check and "On target"; over, the bar full
  and "190 over" in ink; protein reached, its bar green with "Reached".
- **It takes the Nutrition card's place** once targets exist, with that card's
  notes (an estimated day, foods waiting for a look), rather than repeating
  its four numbers beside it. Until then the Nutrition card stays, under the
  checklist.

### Today, when something is missing

```
┌───────────────────────────────────────────┐
│ DAILY TARGETS                             │
│ Your targets need two more things         │
│ ✓ Your goal: Lose fat                     │
│ ○ Your weight                             │
│ ○ Height, age and sex, or a watch that    │
│   reports calories burned                 │
│ [ Set them up ]                           │
└───────────────────────────────────────────┘
```

A checklist rather than an error, so it reads as two minutes of setup, with
what is already done ticked.

### Settings, "About you" and "Your daily targets"

- **About you** (new card, after weight): height, year of birth, sex (female,
  male, prefer not to say), and activity (three choices, each with a line that
  says what it means). The note under it: "Used to estimate what you burn when
  no watch reports it." An unset number shows a starting value ("170 cm") with
  "Not set yet" under it, and confirming that value as it is saves it: found
  while building, the steppers used to save only a changed number, so someone
  exactly 170 cm, or exactly the 75 kg an unset weight shows, could not say so.
- **Your daily targets** (new card): the four numbers, and the working in
  plain words: the burn and where it came from, the goal's balance, the
  protein rule, and the floor if it applied. Ends with: "A starting point, not
  medical advice."

### Nutrition tab

The day's totals show "/ target" under each of the four figures, and protein
turns green when reached, as it already did for a protein goal.

### Hebrew

Every string in both languages; numbers isolated left to right inside
Hebrew text; the bars fill from the right.

## Architecture

```
domain/targets.ts           pure: restingKcal, measuredBurn, dailyTargets,
                            nutrientProgress. No I/O, no dates from the clock.
domain/user.ts              UserProfile gains birthYear and activity.
data/repositories.ts        ProfileRepository.save; observations.listByRange.
data/idb, data/supabase     both implement them; the contract tests hold both
                            to the same behaviour.
data/targets.ts             readDailyTargets(user, day, repos): one profile
                            read, one weight read, one 28-day burn read, the
                            goals; returns targets or what is missing.
ui/useDailyTargets.ts       the hook: re-reads on day change and after any
                            write (the data revision).
ui/components/TargetsCard   the Today card, both states.
ui/components/AboutYou      the Settings cards.
```

- **Why the profile, not observations, for height, age and sex.** They are
  facts about a person that change rarely or never; observations are readings
  over time. The profile row already exists in both stores (with row-level
  security), it only had no write.
- **Why a range read for the burn.** 28 single-day reads would be 28 requests
  to Supabase on every visit to Today; one range query is one.
- **Targets are computed, not stored.** They follow the inputs: weigh in, and
  tomorrow's protein moves. Storing them would mean keeping two copies in step.
  The goal records that feed them stay append-only (D4).
- **Past days** use the burn history up to that day, and the goal and weight
  as they are now. Recomputing a past day's targets from the goal in force
  then is possible later (goals keep their history) and not worth it yet.

## Tests

- **Unit** (`src/domain/__tests__/targets.test.ts`): Mifflin–St Jeor against
  worked examples; measured burn needs 5 days and ignores the day itself; each
  objective's balance; the floor; protein by objective and by target weight; a
  protein goal wins; macros add up to the calories; progress states.
- **Data** (`src/data/__tests__/dailyTargets.test.ts`): measured burn read
  from the store wins over the formula; missing pieces reported.
- **Contract:** the profile round-trips; `listByRange` returns a code's
  readings across days and nothing outside the range.
- **Browser** (`e2e/daily-targets.spec.ts`, desktop, phone and iPhone): the
  card on Today with the sample's targets and what is left; a past day says
  "under" or "over"; "How?" opens the working; a different activity moves the
  target at once; with no profile, the checklist, its accessibility scan, and
  setting the details up from it; a starting value (170 cm) can be saved as
  it is; the Nutrition totals; Hebrew. Protein "reached" and the floor are
  pinned by the unit tests, where any number can be set up.

## Not in this version

- A calorie target typed in by hand (a protein one already exists). Next, if
  people ask: it needs a way to go back to automatic, which append-only goals
  do not have yet.
- Targets on the week view, and streaks (the rest of 6.2).
- Fibre, sugar, sodium: the meals do not record them yet.
- Details given while signed out (height, year of birth, sex, activity) are
  not carried into an account at sign-in, as meals are. Worth adding with the
  next change to sign-in.
- The setup checklist cannot be dismissed. If people who do not want targets
  find it in the way, a "not for me" belongs on it.
