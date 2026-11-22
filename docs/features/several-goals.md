# Feature spec — several goals at once

**One line:** in Settings, any number of the five goals can be chosen
together, for example general fitness and lose weight and build muscle,
and the daily targets and the week follow the combination.

Status: **built 2026-11-22.** The owner chose to keep the five goals and
allow several (2026-11-22). Epic 6 in [`../ROADMAP.md`](../ROADMAP.md).

---

## Why

People rarely want one thing. "Lose weight, but keep my muscle, and be
healthier generally" is one person, and a single choice forced them to drop
two of the three.

## The rule for a combination

Five goals, any number of them. The calories need one direction, so:

| Chosen together | Calories | Protein | Called |
| --- | --- | --- | --- |
| A losing goal (Lose weight or Lose fat) **and** Build muscle | 350 under | the highest chosen (2.0 g/kg) | "lose fat, keep muscle": building while losing is what that goal is for |
| Lose weight (with anything but Build muscle) | 500 under | the highest chosen | |
| Lose fat (with anything but Build muscle) | 350 under | the highest chosen | |
| Keep this weight and Build muscle | level | the highest chosen (1.8) | building at the same weight |
| Build muscle | 250 over | 1.8 | |
| Keep this weight | level | 1.4 | |
| General fitness alone | a guide, level, not graded | 1.6 | |

- **General fitness never moves the calories:** chosen with anything else,
  the other goal decides.
- **Protein is the highest of the chosen goals,** since every one of them
  is served by enough protein and none is harmed by more.
- **The week is graded by the goal that set the calories** (the "lead"),
  exactly as it was graded by the single goal before.
- **At least one stays chosen.** Tapping the last one does nothing, and
  says why.

In `src/domain/objectives.ts`: `resolveObjectives(chosen)` returns the lead
goal and the protein rate. Pure, unit-tested.

## UX

- **Settings → Your goal:** the same five pills, now each a toggle
  (several can be dark at once). The line under them says what the
  combination aims at: the goals' names joined, then the lead's own aim
  ("A gentler 350 kcal deficit with protein held high."), and, when losing
  and building are both chosen, one sentence saying that together they
  mean losing fat while keeping muscle.
- **Today's card and Settings' working** name every chosen goal ("Lose
  weight + Build muscle: 350 kcal under the 2,500 you burn…").
- Hebrew throughout.

## Architecture

- **Stored as before, with one field more.** A goal choice is still one
  ENERGY goal, appended (D4), whose target is the lead's daily balance and
  whose `objective` is the lead; it now also carries `objectives`, the
  whole choice. Everything that read `objective` (the week, its grading,
  the insights) keeps working unchanged; what shows the choice reads
  `objectives`, falling back to `[objective]` for goals saved before.
- `buildObjectiveGoal(user, objectives[])`; `setObjectives` in the actions.
- Targets: `TargetsInput.objectives`; the protein rate comes from
  `resolveObjectives`.

## Tests

- Unit: every row of the table; fitness never moving calories; protein the
  highest; a single goal unchanged; goals saved before (no `objectives`)
  read as one.
- Browser: choosing two goals, the targets moving with them, the last goal
  not deselectable, Hebrew.
