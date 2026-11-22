# Feature spec — goals, as two answers

**One line:** Settings asks two questions, which way the weight should go
(one answer) and what else the person is working on (any number), so every
combination means something and none contradicts itself.

Status: **built 2026-11-22.** The same day's first version let several of
the five goals be chosen at once; the owner pointed out it allowed nonsense
("lose weight" and "keep this weight" together), and chose this design,
adding "Lower body fat". Epic 6 in [`../ROADMAP.md`](../ROADMAP.md).

---

## The two questions

1. **Your weight** (one): Lose weight · Keep my weight · Gain weight · No
   weight goal.
2. **Also working on** (any, or none): Build muscle · Lower body fat ·
   General fitness.

Something else chosen before the weight question counts as "No weight
goal" until a weight answer is picked.

## What a combination means

| Your weight | with | Calories | Protein g/kg | In plain words |
| --- | --- | --- | --- | --- |
| Lose | nothing, or fitness | 500 under | 1.6 | lose weight |
| Lose | muscle or body fat | 350 under | 2.0 | lose fat, keep muscle |
| Keep | nothing | level | 1.4 | |
| Keep | build muscle | level | 1.8 | build at the same weight |
| Keep | lower body fat | level | 2.0 | same weight, less fat |
| Gain | nothing or muscle | 250 over | 1.8 | |
| Gain | lower body fat | 250 over | 2.0 | gain lean |
| No weight goal | anything | a guide, not graded | 1.6, or as raised | |

General fitness never moves the calories; it raises protein to 1.6 at
least. Lowering body fat asks for 2.0 whatever the weight does.

The week is graded by the goal the answers come to: lose weight, lose fat,
keep, gain (build muscle), or none (ungraded), the same five as before.

## UX

- **Settings → Your goal:** "Your weight" as a row of four pills that
  behave as radio buttons (one is dark); "Also working on · any, or none"
  as three toggles. Under them, one or two sentences saying what the
  combination means ("Losing while keeping muscle: a gentler deficit, so
  what goes is fat.").
- **A target weight is asked only when the weight is meant to move** (lose
  or gain).
- **Today's card and Settings' working** name the answers: "Lose weight +
  Lower body fat: 350 kcal under the 2,500 you burn…".
- Hebrew: המשקל שלכם (לרדת, לשמור, לעלות, בלי יעד משקל); עוד עובדים על
  (לבנות שריר, להוריד אחוז שומן, כושר כללי).

## Architecture

- `src/domain/goalChoice.ts`, pure: `leadObjective(choice)`,
  `proteinPerKg(choice)`, `wantsTargetWeight(choice)`,
  `goalChoiceOf(goal)`, `choiceFromObjectives(objectives)`.
- **Stored on the ENERGY goal, appended (D4):** `choice` (the two answers,
  as given) and `objective` (the goal they come to). Everything that reads
  `objective`, the week and its grading included, is unchanged.
- **Goals saved before are read as answers:** lose fat as Lose + Lower body
  fat, build muscle as Gain + Build muscle, keep as Keep, fitness as No
  weight goal + General fitness, and the one day's several goals likewise.
- Targets: `TargetsInput.choice`; protein from `proteinPerKg`.

## Tests

- Unit (`src/domain/__tests__/goalChoice.test.ts`): the goal each
  combination comes to; protein for each; the target weight question; goals
  saved every earlier way; unknown words dropped; the targets.
- Browser: the weight as one answer (choosing one switches the other off);
  what else as any; the targets moving; Today naming the answers; the week
  graded or not; the target weight asked only for lose and gain; the choice
  carried into an account at sign-in.
