# Feature spec — asking the model to read your week

**One line:** a button on the week view sends seven days of meals, the totals
and the goal to the model, and reads back what is worth changing — and the week
refuses to show anything at all until there is something real to compare.

Status: **built** (Aug 2026).

---

## 1. What is sent, and the promise about it

The payload is a named type, [`WeekReport`](../../src/domain/weekReport.ts),
rather than "whatever the screen had. That is the whole design: the button
says *"nothing that says who you are"*, and a promise like that is only worth
making if someone can check it by reading one file.

What goes: seven days of meals with their names and macros, the weekly totals,
the objective and how far the week landed from it, and optionally the weight and
target.

What does **not** go: any identity at all. No name, no email, no user id, no
record ids, no provenance, no timestamps beyond the calendar dates. The model is
asked about seven days of food and arithmetic; it has no business knowing whose.

A test asserts this rather than trusting the comment — it serialises a real
report and fails if the user id, an `"id":` key, an `@`, or the word
`provenance` appears anywhere in it.

The card also says the size of what is about to be sent — *"Sends 14 meals
across 7 days"* — **before** it is sent. Someone agreeing to share a week of
their eating should be able to see what they are agreeing to.

## 2. The week refuses to guess

Two things have to exist before the week says anything, and each gets its own
empty state rather than a shared one:

| Missing | What is shown |
|---|---|
| Any burned figure | *"Set what you burn first"* — the chart and summary stay away rather than draw half a comparison |
| An objective | *"Pick what you are working towards"* — a week can be added up without a goal, but not judged |

The order matters: burn first, because without it the chart has nothing to draw
and the totals are half a comparison. A missing goal is the smaller absence — it
only stops the week being *graded*.

The insights card is behind the same gate. Asking a model to comment on a week
with no expenditure figure would be asking it to invent the other half.

> The design only covers the burn case. The goal case, and its copy, are mine —
> see §6.

## 3. Why it is on the existing port

`weekInsights` sits on `FoodEstimator` beside the two food methods. It is the
same provider, the same key, the same entitlement, the same error vocabulary and
the same BYOK-or-proxy choice — everything except the question being asked. A
second port would have duplicated all of that to gain a narrower name.

The reply is a **typed shape**, not markdown:

```ts
{ summary: string; observations: string[]; suggestions: string[]; confidence: number }
```

Which is what lets it be rendered in the app's own type and language, and what
makes *"it found nothing"* representable — an empty `suggestions` with a low
confidence — instead of being dressed up as advice.

`validateInsight` is deliberately **softer** than `validateEstimate`. A
malformed estimate must fail, because a wrong number becomes indistinguishable
from a measurement once written. An insight is prose the user reads and judges,
so a missing list is repaired rather than rejected. A reply with no summary
*and* no observations still fails: that is not a thin answer, it is no answer.

## 4. What the prompt refuses

The risk here is not a wrong number — it is confident advice built on four days
of data, or a paragraph of encouragement that says nothing. So most of the
prompt is about refusing:

- Quote the numbers you are reading; no praise, no filler.
- Suggestions must be small enough to do tomorrow and tied to an observation.
- Confidence must reflect how much data there actually is — four days out of
  seven is not a week, and should read below 0.5.
- Never diagnose, never name a disease, never suggest a supplement or
  medication, never propose a target under 1200 kcal/day.
- **"An empty answer is a valid answer; inventing a pattern from three meals is
  not."**
- Do not address the person by name or infer who they are.

Tests assert these clauses are present, because they are the difference between
a health app and a liability.

## 5. The audit trail

Every answer writes an `AIInference` with purpose `HEALTH_SCAN` (D13): advice is
a claim the app made, and claims have to be answerable for later — including the
wrong ones. What is kept is the reply plus the *shape* of what was sent: totals,
the goal, the day range, and how many meals. The meals themselves are not
duplicated, because they are already records of their own.

A confidence below 0.5 is flagged `LOW_CONFIDENCE` on the row.

## 6. What the design did not cover

The mockup still shows the AI card as a disabled *"not built yet"* pill. It
covers the burn-blocked week and nothing of the feature itself, so these are
mine, built to match the app's existing language:

- **Asking** — the payload sentence and the ask button.
- **Running** — a pulsing dot with *"Reading your week…"*, the same shape as the
  photo analysis wait.
- **The answer** — summary, "What is in the data", "Worth trying", a confidence
  pill, and Ask again / Close.
- **Failing** — the message plus a retry, as the estimate card does.
- **The goal-blocked week** — copy and all.

Worth redesigning if any of it reads wrong; the states themselves are all
needed.

## 7. Still open

**Insights are not persisted for re-reading.** The card resets when you leave
the screen — the answer lives in the `AIInference` row but nothing reads it back
yet. Deliberate for now: showing a stale reading of a week that has since gained
two days would be worse than showing none.

**It counts as one trial analysis.** A week report is a bigger prompt than a
photo, and the ledger treats it identically. Worth revisiting when there are
real numbers on what it costs.

## 8. A design smell this fixed

`readWeek` reached for `getRepositories()`, the composition root — and importing
that root opens the app's database connection as a side effect, which made these
functions impossible to test against a throwaway store. The repositories are
passed in now. A reader that cannot be tested is a reader nobody can trust.
