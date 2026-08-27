# Feature spec — correcting an estimate, and talking to it

**One line:** an AI estimate stops being take-it-or-leave-it — its numbers are
editable before you save them, and the model may ask one question whose answer
sharpens them.

Status: **built** (Aug 2026). Two requests that turned out to be one idea.

---

## 1. The idea underneath both

An estimate was a verdict. The card showed numbers and offered Save or Discard,
so a user who could *see* the portion was wrong had two bad options: save the
wrong number and correct it on another screen, or throw the analysis away and
photograph the plate again.

Meanwhile the model was frequently uncertain about exactly one thing — grilled
or fried, whole milk or skimmed, how large the bowl was. It could not ask. It
guessed, wrote the guess into `assumptions`, and lowered its confidence.

Both are the same missing idea: **the estimate is a starting point, and the
person holding the plate knows things the model does not.** One feature lets
them type those things; the other lets the model ask for them.

## 2. Correcting the numbers

Adjusting is a **screen of its own**, and it argues with one number: weight.

The first version put six fields on every food — name, grams, calories,
protein, carbs, fat — inside a card already carrying totals, assumptions and
two buttons. Correct, and about as far from a phone interface as a form can
get. The model is usually right about *what* is on the plate and wrong about
*how much*, so the one figure worth disputing now gets a thumb-sized stepper
(±10 g) and the macros follow it by ratio. Typing straight into the box still
works, because eight taps to reach 250 g would be its own kind of insult.

Editing an individual macro is still possible **after** saving, in Nutrition —
where a person is correcting a number rather than a portion. That split is the
point: two different jobs, two different controls.

What the screen shows:

- A photo thumbnail beside "Read from your photo a moment ago."
- Totals at display size with a badge: **"−33 kcal vs the estimate"**, or
  "unchanged".
- Per row: the macros read-only, a stepper, **"−20 g"** against "as estimated",
  and the model's own confidence quoted next to it.
- **"Not on the plate"** to drop a food, which dims the row rather than
  deleting it, so it can come back.
- **"+ Something it missed"** — the oil in the pan, the second slice. Added at
  **zero grams with no nutrients**, deliberately: inventing numbers for it
  would be exactly the guessing this screen exists to correct, so it waits for
  a weight. "How many calories is that?" is a better question for the model
  than for this form.

**Reuse, not a second copy.** `scaleTo` in
[`src/domain/mealEdits.ts`](../../src/domain/mealEdits.ts) was widened from
`FoodItemEdit` to a structural `Portioned`, so the stepper and the saved-meal
editor share one piece of arithmetic and one set of tests.

### Provenance is the decision worth getting right

At save (`buildEstimatedMeal`):

| What you did | What is written |
|---|---|
| Changed a number or the name | `USER` / `RAW` — your own figure |
| Left it alone | `AI_ESTIMATE` — still wants confirming |
| Removed it | Nothing; it is not in the meal |

A corrected item becomes a **user entry, not a confirmed estimate**: a human
looked at what the model said and wrote down what it should be, and it would be
strange for correcting a guess to leave it needing confirmation. This is the
rule `applyMealEdit` already applies to a saved meal — one rule at two moments
rather than two rules.

One meal can honestly carry both kinds of row, and Nutrition shows that: the
corrected food has no Confirm button, the untouched one does.

### The audit trail keeps both halves

`EstimateResult` is never modified. It is what the model actually said, and it
has to stay that way to be worth anything. Corrections travel beside it and are
written into the `AIInference` row next to the raw reply, so "why does it say
that?" can be answered with *what the model claimed* and *what the human
overrode* — not one or the other.

Corrections are positional (`index`), because an estimate has no ids yet; it is
a reply from a model, not a record.

## 3. The model asking a question

The reply contract gains an optional `"question"`, and three rules:

- Ask at most one, and only when the answer would **materially** change the
  numbers.
- A question **never replaces the estimate**. Always return the items and the
  confidence too.
- Omit it entirely when nothing material is unclear — which is most of the time.
- Never ask about something the hints already said.

The second rule is what stops this becoming a dead end. The numbers on screen
are always complete and always saveable, the copy says so out loud
("Questions never block saving"), and **"Skip — save as it is"** sits beside
the input. A question that could block a save would be worse than no question.

### A question has to explain itself

The contract asks for two more fields, and they are what make the difference
between a question and an interrogation:

- **`questionReason`** — one sentence naming *which* number is shaky and what
  was assumed: "Fat is the number I am least sure of — 11 g assumes a dry pan."
  Without it the user is asked to work for the model with no idea what it buys
  them, and the honest answer to "why should I bother?" is missing.
- **`questionOptions`** — two to four tappable answers in plain words. They are
  shortcuts, never the whole answer space, so the free-text box sits directly
  beneath them rather than behind a "something else" tap: the answer the model
  did not anticipate is the one that matters most.

Both are decoration on the question. If the model omits or mangles either, the
question still stands — neither may ever fail an estimate.

The card is shaped as a **message**, not a form: an accent avatar, "Timeline",
"just now", and the question itself in the display serif. That is what it
actually is — the model saying which of its own numbers it distrusts.

### What an answer changed

Answering produces a **revision**, and the revision leads with deltas:
"Estimate · revision 2", a sage "Updated from your answer" badge, and each
figure carrying "+40" or "unchanged" with the changed ones in accent. Plus an
"Added from what you said" row naming any food the answer introduced.

The deltas are the entire justification for having asked. "Fat 16 g" is a
number; "Fat 16 g, +5" is the answer paying for itself — and without it a user
has no way to judge whether replying was worth the tap, which decides whether
they ever reply again.

Below it, **"How it got here"**: the exchange as alternating message bubbles,
with any further question inline. Once the meal is saved the numbers are all
that survive into the day's totals, so this is the only place the reasoning
behind them is visible while it still matters.

### The follow-up turn

No new port method. The two existing ones grew an optional third parameter:

```ts
estimate(photo, hints, answers?: readonly FollowUp[])
estimateFromText(description, hints, answers?: readonly FollowUp[])
```

Both adapters already funnelled through one private helper, so it is one change
each. The exchange is appended as a single user message, quoted between markers
exactly as a note is — an answer that reads like an instruction ("ignore all
previous instructions") arrives as the thing being estimated:

```
You asked: "Was it fried?"
The user answers, between the markers:
<<<
Grilled, no oil
>>>
Re-estimate with these answers taken as ground truth.
Do not ask again about anything already answered.
```

The provider's API is stateless, so **each round re-sends the photo and pays
for it again**. That is the whole reason the allowance is finite.

Answering returns the analysis to `running`, so the entire waiting experience —
the ring, the sweep, the docked bar that survives leaving the screen — is
reused without a line of new code.

## 4. A conversation costs one analysis

Settled with the owner: a meal the model asked about must not cost three of a
user's ten free photos, or nobody will ever answer a question.

Follow-ups are recorded with outcome **`OK_FOLLOWUP`**. Both trial counters —
the edge function's and `readTrialStatus`'s — already match `outcome = 'OK'`
exactly, so follow-ups are metered, costed and auditable **without counting**,
and *neither count query changed*. Widening either match to a prefix would
silently start charging for answered questions; there is a comment in
[`trial.ts`](../../src/data/trial.ts) saying so.

What makes that safe to trust is `conversation_id` (migration
[`0006`](../../supabase/migrations/0006_conversation_followups.sql)). The server
counts prior rows for the same conversation rather than believing a client:

| Situation | Treated as |
|---|---|
| No prior row for this conversation | A fresh analysis — charged. A client cannot forge a discount. |
| Already `MAX_FOLLOW_UPS` (2) follow-ups | A fresh analysis — charged. Never blocks; just stops being free. |
| Otherwise | `OK_FOLLOWUP` — free |

The trial wall also **steps aside for a follow-up**: otherwise the tenth free
photo could ask a question the user is then refused permission to answer, which
would be a strange way to spend someone's last analysis.

## 5. A bug this found

`retry` and `restartWith` read state inside a `setAnalysis` updater and started
a new run from there. An updater must be pure, React may call it twice under
StrictMode, and a `setState` issued from inside one is not reliably applied —
so answering a question appeared to do **nothing at all** the first time it was
driven in a browser. Both now read a ref. The unit tests could not have caught
this; only the browser could.

## 6. Tests

- `scaleTo` still exact after widening; re-portioning on estimate rows.
- `buildEstimatedMeal` with corrections: changed → `USER`, untouched →
  `AI_ESTIMATE`, removed → absent, rename counts as a correction, the audit row
  carries both, and an unchanged form adds no clutter.
- `validateEstimate` reads `question`, `questionReason` and `questionOptions`,
  tolerates any of them being absent, caps the options at four, drops junk
  entries rather than failing the estimate, and discards a reason or options
  that arrive with no question to decorate.
- `followUpText` quotes between markers, caps length, carries every round.
- Both adapters append the exchange; the proxy sends `conversationId`.
- Against real Postgres: three calls about two meals count as two analyses,
  all three rounds stay on the ledger, follow-ups are countable, and `outcome`
  is still constrained.

## 7. Still open

**Two devices, one conversation.** `conversation_id` is minted in the browser
and lives only in memory, so answering on a different device starts a fresh
analysis. Correct, if slightly wasteful; worth revisiting only if it ever
happens in practice.

**The exchange is not saved with the meal.** "How it got here" lives only as
long as the analysis does; once saved, the meal keeps the final numbers and the
`AIInference` row keeps the raw reply, but the questions and answers are gone.
Keeping them would mean a place to put them — a conversation attached to a
record, which is a schema decision rather than a UI one, and not one to make
before anyone has missed it.
