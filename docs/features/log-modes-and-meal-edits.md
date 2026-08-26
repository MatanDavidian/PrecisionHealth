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
