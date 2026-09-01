# Feature spec — three ways to log, and fixing what you logged

**One line:** the Log screen becomes three modes — **Photo**, **Write**,
**Again** — each holding one input and nothing else; and a meal that is already
logged can be corrected or deleted, with Undo.

Status: **built** (Aug 2026). Estimate-from-text was the last gap in the repeat
family ([`repeat-meals.md`](repeat-meals.md) §6); editing was the last thing
D15's versioning was built for and nothing used.

---

## 1. Why this, and why together

Two complaints, one cause.

The Log screen had grown to three jobs stacked vertically: a repeat list, then
a camera, then a details form. Whatever you came to do, it was below something
else — and on a phone the camera was often below the fold entirely. The screen
was not *missing* anything; it was refusing to say what it was for.

Meanwhile a logged meal was final. Every mechanism for changing one already
existed — versioning (D15), item supersession (D4), retraction (Q7) — and only
Undo-immediately-after-logging ever used them. If the model read 320 g and it
was nearer 260, you could confirm a wrong number or log a second meal to cancel
it out. Neither is a thing a person should have to think of.

Both are the same fix: make the thing you actually want to do the thing that is
on screen.

## 2. Three modes

The tabs sit under the page title and above one panel. They disappear the
moment something is being estimated — at that point there is one thing on
screen and one decision to make about it.

| Mode | For | What it holds |
|---|---|---|
| **Photo** (default) | Food in front of you | The camera, an optional note, and the single most-repeated meal for this hour |
| **Write** | Food you already ate, or never photograph | A text box, Estimate, and the sentences you have used before |
| **Again** | The boring days, which are most of them | Search, this hour's usuals, yesterday, single-food chips |

The mode lives in the URL (`/log?mode=write`) so it survives a reload and can
be linked to — "log by hand instead" and the *Again* link in Photo mode both
need somewhere to point.

### Photo mode, and the note

The note is the cheapest accuracy in the product. A photo cannot show that the
pan had no oil, or that half of it went back in the fridge; the person holding
the phone knows both, and one line from them beats a bigger model. It is
`EstimateHints.note`, sent with the photo and treated as ground truth.

Collapsed behind "Add a note" on purpose: most meals need nothing said about
them, and a form in front of the shutter is a reason not to log at all.

Photo mode also keeps **one** repeat row — "Usual now", the single thing eaten
most often at this hour — with a line pointing at *Again* for everything else.
One row is a shortcut; the old six-row card was a decision.

### Write mode

Type "two eggs on toast and a black coffee", get the same estimate the camera
would give, settled by the same Confirm flow. Faster and cheaper than a photo,
and honestly less accurate:

- The **prompt is not the photo prompt with a word swapped**
  (`TEXT_SYSTEM_PROMPT`). It tells the model to assume ordinary portions where
  none are given, to say so in `assumptions`, and to let confidence reflect
  that it is portioning blind.
- The result card says `assumed 170 g` rather than `170 g`, and carries the
  line "Confidence is lower than a photo's — nothing was seen".
- The description is **quoted between markers**, never concatenated into an
  instruction, so a sentence that reads like a command arrives as the thing
  being estimated rather than as something to obey.

The last five descriptions are kept in `localStorage`
(`src/data/descriptions.ts`) as chips. Device-local and deliberately not a
record: what you typed is already kept properly on the `AIInference` behind the
estimate, and losing the chips costs one retype.

### Again mode

The old usuals card, with search promoted to the top. Typing in it searches
everything ever logged rather than this hour's three rows — someone searching
"porridge" at seven in the evening wants the porridge, not to be told there is
none for dinner.

## 3. Text estimation, end to end

One port, two inputs. `FoodEstimator` (renamed from `FoodVisionEstimator`)
gains `estimateFromText(description, hints)` alongside `estimate(photo, hints)`,
and all three adapters implement it:

| Adapter | Photo | Text |
|---|---|---|
| `OpenAiEstimator` | `SYSTEM_PROMPT` + `image_url` | `TEXT_SYSTEM_PROMPT` + quoted description |
| `ProxyEstimator` | `{ photo }` to the edge function | `{ text }` to the same endpoint |
| `FakeEstimator` | the sample reply | the sample reply, confidence −0.15 |

Everything downstream is shared: validation (`validateEstimate`), the grams
hint, the docked progress bar, the result card, Save, and the audit record.
The awkward parts of the OpenAI call — which dialect of token limit the model
speaks, whether it knows JSON mode, the one repair attempt — live in a single
private `ask()` rather than in two near-identical copies.

**Entitlement does not care which input it was.** The edge function takes a
photo *or* a description, counts both against the same trial, records both in
the same ledger, and clamps the model the same way. From the payer's side they
are one call.

**The description is stored; a photo still is not.** `AIInference` gains
`FOOD_TEXT_ESTIMATE` as a purpose, and the text goes in `output.description`.
None of the reasons a photo is not stored (Q10 — size, sensitivity, the promise
made in Settings) apply to a sentence the user typed, and it is what makes the
estimate explainable a month later.

## 4. Editing a logged meal

`applyMealEdit` (`src/domain/mealEdits.ts`) is the whole rule:

- The meal is **never mutated**. The edit is a new record at `version + 1`
  (D15); the version that was there is still readable.
- A changed food is a **new item superseding the old one** inside that record
  (D4) — exactly the chain a Confirm writes, because a correction and a
  confirmation are the same act with different numbers.
- Items the user did not actually touch are left byte-identical. Opening the
  form and saving it unchanged writes nothing at all (`changesAnything`).
- **Editing an AI estimate confirms it.** A human looked at the number and said
  what it should be; it would be strange for correcting a guess to leave it
  still asking to be confirmed.
- The meal's own provenance is **left alone**. "This began as a photo estimate"
  stays true after you fix the grams, and the item chain records who authored
  each number.

### Re-portioning

The commonest correction by far is the portion. Changing **Grams** re-scales
that item's calories and macros by ratio, and the form says so. Typing over any
other number simply overwrites it — that is how the link is broken, and there is
no mode to leave, because a mode you have to notice is one people get stuck in.

A zero-weight item cannot be scaled from nothing, so its numbers are left alone
rather than zeroed.

### Describing a meal for another day

The **Add meal** pill on the logged list opens a sheet with a **Manual /
Describe** toggle. Describe is the same estimator the Log screen's Write mode
uses and the same result card; the only difference is which day it lands on.

That difference is the whole feature. The Log screen always means *now*, and the
meal you actually want to describe is the one you forgot — which by definition
was earlier. Stepping the day header back and then opening Add meal is what
makes this the answer to that, with no separate "backdate" control to learn.

The result is written as two records (D13): the `AIInference` first, then the
`Meal` that references it, so a failure between them leaves an unused audit row
rather than a meal pointing at nothing. `addEstimatedMeal` is separate from
`addMeal` because the latter is for numbers a person typed, and these came from
a model and carry its provenance.

The totals card's label follows the day too. It read "Today's total" on every
day, which was wrong the moment you stepped back one — now it says "Total for
Yesterday" when you are there. The design writes that as "Yesterday's total";
the possessive form does not survive a label like "Sunday, August 30", so the
prepositional one is used for every day but today.

### Logging a meal you forgot

Typing a meal in by hand works on **any day you can navigate to**, not only
today. Forgetting to log something is the ordinary reason to be looking at
yesterday at all, so refusing to let you fix it there was the wrong shape.

It was never a deliberate rule. The form built its instant from `new Date()` and
carried only the typed clock time, so a meal entered while looking at last
Tuesday would have been filed under today — silently, and wrongly. Locking the
button to today hid that rather than fixing it. The form now takes the day on
screen and resolves the typed time on it with `zonedTimeToUtc`, which is what
the meal editor already did for a logged meal's time.

`zonedTimeToUtc` rather than arithmetic on a midnight, because the day a clock
changes is 23 or 25 hours long, and adding hours to it puts breakfast on the
wrong day once a year. The tests check `00:15` and `23:45` — where an hour of
error moves a whole day's calories onto its neighbour — and 25 October 2026,
when Israel leaves DST.

Observations were never restricted this way: the burned-calories stepper has
always written to the selected day through `instantOn`. Meals were the odd one
out.

### Leftovers — what came back on the plate

A meal-level control in the editor, unlike Refill which belongs to one food.
Photograph or describe what is left, and each food is scaled to the share that
was **eaten**.

**Per food, not per meal.** "I finished the chicken and left half the rice" is
the normal shape of a leftover, and one percentage across the meal cannot say
it — it would move protein and carbohydrate in step when the whole point is
that they did not. The headline figure ("about 70% of this meal was eaten") is
derived, weighted by calories rather than by weight: leaving the salad and
leaving the steak are different days, and averaging the fractions would call
them the same.

**The model is given the plate**, indexed. It cannot map "half the bread" onto
item 2 without knowing there is a bread, and the reply refers to foods by index
rather than name because the model writes names in the user's language.

Three rules the arithmetic follows, each with a test:

- **A food the estimate does not mention is left alone**, treated as fully
  eaten. The asymmetry is deliberate: assuming "eaten" costs an unrecorded
  leftover, which is the same as not using the feature. Assuming "left" makes
  food you did eat vanish with nothing to notice it by.
- **A food eaten to zero keeps its row at 0 g** rather than being deleted. A
  model should not be able to remove a record on its own; the row stays visible
  and Remove is one tap away for anyone who agrees with it.
- **Fractions are clamped into 0..1** before they reach the arithmetic, and an
  index no food occupies is dropped. These numbers subtract from a meal that is
  already recorded, so a hallucination here removes food someone ate.

**Provenance is the decision worth stating.** When a person types 260 over the
model's 320, that is confirmation — a human looked and said what it should be.
A leftover is the reverse: the human supplied the evidence and the **model**
produced the numbers. So the scaled foods carry `AI_ESTIMATE` pointing at the
inference that made them, and they need confirming, exactly as a photo estimate
does. Pressing Apply agrees to record the claim; it does not vouch for it. That
is why applying is its own write rather than a merge into the edit in progress —
`applyMealEdit` stamps `USER_CONFIRMED`, which would be a lie here.

### Editing on a phone

Below `md` — the width at which the app shows its bottom bar — editing opens as
a **sheet** over a dimmed page rather than inline. A five-field form in the list
pushes the list of what you ate off the screen, which is the one thing the page
is for. Tapping the dim closes it; so does `Escape`.

The sheet sits *on top of* the bottom bar, not over it, so the tab you are in
stays visible. Both sides of that read `--spacing-bottom-nav` from
[`styles.css`](../../src/styles.css): the bar sets its height from the token and
the sheet offsets by it, because a guessed number in the second place drifts the
moment the first one changes.

Three things the phone does differently, following the design:

- The four totals sit in a 2×2 grid instead of a row.
- The macros shrink to a **four-up strip** under Grams — `kcal / Prot / Carb /
  Fat`, centred — so a Refill's ratio is visible in one glance. The short names
  are `display:none`-swapped against the full ones, so a screen reader reads
  exactly one name per field rather than "Calories kcal".
- **Save carries the number it will write** — `Save · 2,247` — because the
  totals card is behind the sheet while you are changing it. The arithmetic
  swaps rather than adds: day − saved + edited.

Refill's target grows to 44px on a phone and takes the accent once it has been
used, and the line beneath says what it did: `Refilled 2× · +21%`. Typing a
weight by hand clears that tally, because a typed number is not a tap.

Cancel comes first on a phone and Save first on a desktop — the order follows
the thumb, not the page. Delete drops to its own line rather than sitting a
thumb's width from Save (Q7).

### Refill — ten percent more, without typing

Beside the **Grams** field is a **Refill** button. One press adds 10% to the
portion and carries calories, protein, carbs and fat with it by the same ratio.
It is the same `scaleTo` arithmetic re-portioning already used, reached without
working out what 10% of 320 is.

It **compounds**: each press is ten percent of what is on screen, not of what
was saved, so three presses read as three helpings rather than arithmetic about
an original nobody is looking at any more. Once a food has moved, a **Back to
N g** link appears beside *Remove this food* and restores that item's saved
portion, macros and all — Refill is easy to press twice by accident, and the
way back should not be "cancel the whole edit".

Three details the numbers force, which the design's version does not have:

- **It always adds at least a gram.** A plain `round(g * 1.1)` is a no-op below
  5 g — ten percent of 4 rounds back to 4 — and the button would look broken on
  exactly the small items where a gram matters most.
- **It floors rather than ceils.** `ceil` looks like the obvious fix and is
  wrong: `100 * 1.1` is `110.00000000000001` in binary floating point, so `ceil`
  would invent a 111th gram.
- **It stops at `REFILL_MAX_G` (900 g)** and never shrinks. A food already at or
  above the ceiling is returned untouched and the button disables itself, rather
  than being quietly pulled back down to 900.

The arithmetic is `refill()` in [`src/domain/mealEdits.ts`](../../src/domain/mealEdits.ts),
beside `scaleTo`, so it is unit-tested rather than living in a click handler.

### Removing one food

Dropping a food takes its **whole correction chain** with it. `liveItems` hides
an item only while something still supersedes it, so removing a correction
without removing what it corrected would resurrect the old value. The earlier
versions of the meal still hold every record, which is where the audit trail
actually lives.

### Time and slot

Changing the time resolves the new instant **in the meal's own date and zone**
(`zonedTimeToUtc`), not today's and the device's — so correcting yesterday's
dinner does not move it onto today, or shift it an hour because you have since
flown (D7).

## 5. Deleting a meal

Still a retraction, never a delete: `retractMeal` appends a version marked as
not having happened. Readers skip it, history keeps it (Q7).

What is new is the way back. `restoreMeal` appends *another* version saying it
happened after all — the mirror of retraction, and it has to exist for the same
reason. A delete that cannot be taken back is a trap on a phone, where the
button is a thumb's width from the one beside it.

The Nutrition list shows the undo where the meal was, and says what it cost:

> **Breakfast deleted** · 560 kcal came off today's total — **Undo** · Dismiss

`deleteMeal` returns the retraction record, because putting the meal back needs
the version that removed it, not the one the user was looking at.

## 6. What is where

| Path | Role |
|---|---|
| `src/domain/mealEdits.ts` | `applyMealEdit`, `scaleTo`, `editableItem`, `changesAnything`. Pure. |
| `src/domain/mealVersions.ts` | `restoreMeal` joins `retractMeal` |
| `src/ai/estimator.ts` | `FoodEstimator` with both inputs; `EstimateHints.note` |
| `supabase/functions/_shared/prompt.ts` | `TEXT_SYSTEM_PROMPT`, `describedFoodText`, shared `REPLY_CONTRACT` |
| `src/data/descriptions.ts` | The five sentences you used last, on this device |
| `src/ui/components/ModeTabs.tsx` | The segmented control |
| `src/ui/components/log/` | `PhotoPanel`, `WritePanel`, `InputPreview`, `EstimateCard` |
| `src/ui/components/MealEditor.tsx` | The correction form |

## 7. Tests

- `src/domain/__tests__/mealEdits.test.ts` — 13 cases: re-portioning arithmetic,
  supersession, confirmation-by-correction, removal chains, no-op detection,
  delete/undelete.
- `src/data/__tests__/mealEditing.test.ts` — the same through a real store: the
  day total moves, both versions survive, a text meal's inference records its
  description.
- `src/ai/__tests__/textEstimate.test.ts` — the text path on both adapters, the
  quoting of untrusted description text, and the fake's lower confidence.
- `src/data/__tests__/descriptions.test.ts` — the recents list, including
  storage that is unavailable or holding rubbish.

## 8. Still open

- **A second opinion on a written meal.** "That looks like 600 kcal, not 400" —
  the model has no way to know it was wrong, and no history is consulted.
  Waiting on the analytics slice.
- **Editing a meal that is in conflict.** Two devices editing the same version
  is already surfaced (D15); editing *while* a conflict is unresolved is
  currently possible and simply produces another version. It has not bitten,
  but it is not designed either.
- **Undo lives for one screen.** Navigating away loses the undo banner; the
  meal is still recoverable, but only by someone who knows retraction exists.
