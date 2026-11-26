# Feature spec — what to eat now, from what you usually eat

**One line:** when the day still has room (say 300 kcal and 40 g of protein
left in the evening), one tap asks the model for three things to eat that
fit it, built mostly from foods you already eat, each one tap to log.

Status: **built 2026-11-26; live with the next deploy** (the app and the
`estimate-food` function; the Privacy Policy and Terms change with it, version
2026-11-26). Mock-ups and screens as built:
[`mockups/meal-suggestions/`](mockups/meal-suggestions/). Owner's choices,
2026-11-26: Log it at once with Undo, plus **Take a photo** for when it is
made; on Today only; English and Hebrew. Builds on
[`daily-targets.md`](daily-targets.md) (what is left) and
[`repeat-meals.md`](repeat-meals.md) (what you usually eat), and asks the
model the way [`week-insights.md`](week-insights.md) does.

---

## The problem

At 20:30 Today says "300 kcal left, protein 102 of 140 g". The person knows
the gap, but not what closes it, and the honest options are in their own
history: the cottage cheese they eat four times a week, the tuna in the
cupboard. A generic "eat more protein" is no help; "250 g of your usual
cottage cheese and a tin of tuna on two rice cakes: 290 kcal, 38 g protein"
is.

## What it does

- **Where:** on Today's targets card, today only, while the day has room: at
  least 100 kcal left, or at least 10 g of protein short. One line:
  "Left today: 300 kcal · 38 g protein" and **Suggest what to eat**.
- **Optional note**, one line, folded by default: "quick", "no cooking",
  "vegetarian tonight", "I'm at my parents'". The model treats it as a rule.
- **The answer:** up to three suggestions, best fit first. Each one:
  - a name ("Tuna and cottage on rice cakes")
  - where it comes from: **Your usual** (a meal you log often), **From your
    foods** (things you eat, combined), or **New idea** (at most one of the
    three, and never the first)
  - the foods with amounts, and kcal · protein · carbs · fat
  - how it fits: "Leaves 10 kcal · protein 140 of 140 g ✓"
  - one line of why, quoting the numbers
  - **Log it**: logs it now, in the current meal slot, with Undo. It is saved
    as an estimate you can correct in Nutrition, like any model numbers.
  - **Take a photo**: for when it is made, a little differently perhaps. It
    opens Log's camera with the note "As suggested: Tuna and cottage on rice
    cakes (tuna, cottage cheese, rice cakes). Read the amounts from the
    plate.", so the photo is read knowing what it is, at the amounts really
    served. A photo analysis, like any other.
- **Ask again** asks once more (the same request, told to avoid what it just
  offered). **Close** puts the card back to the one line.
- **When the day has no room**, there is no button: the targets card already
  says "On target" or "X over", and suggesting more food would be wrong.

### Rules the model is held to

- Fit the room: total calories at most what is left (+10%), and close the
  protein gap first, then carbs and fat.
- Prefer the person's own foods and usual portions; a new idea at most once.
- Fit the time: an evening snack, not a three-course lunch; nothing already
  eaten today unless it is a staple (the list of today's foods is sent).
- Real, ordinary food in normal portions. Never a supplement, a protein
  powder unless it is in their own foods, a medication or a diet product.
- Never comment on the person's body, never diagnose, never go below the
  daily floor (1,200 / 1,500 kcal).
- If nothing honest fits (20 kcal left, 30 g protein short), say so: one
  suggestion that closes most of the protein, and a sentence saying the gap
  is fine to leave.

## UX

Screens (EN and HE) in [`mockups/meal-suggestions/`](mockups/meal-suggestions/):

1. **Ask:** the targets card with the line and the button; the note folded.
2. **Thinking:** "Looking through what you usually eat…" with the pulsing dot
   the photo wait uses; Cancel.
3. **Three suggestions:** cards inside the targets card, the best first, each
   with its badge, foods, numbers, fit line and Log it.
4. **Logged:** "Logged: Tuna and cottage on rice cakes · 290 kcal · Undo". The
   targets above move at once; the suggestions close.
5. **Hebrew,** right to left, numbers kept left to right.
6. **Other states:** out of analyses (subscribe / own key / log by hand),
   signed out (sign in for 10 free analyses), no targets yet (no button; the
   setup card is already there), and the model saying the gap is fine.

## Cost

One **written analysis** (the plan's 200 a month, or one of the 10 free ones),
like a week's insights. Ask again is another one. On your own OpenAI key it is
a fraction of a cent. Logging a suggestion costs nothing.

## What is sent, and the promise about it

A named type, `SuggestionRequest`, so the promise can be checked in one file:

- what is left today: kcal, protein, carbs, fat
- the meal slot and the local time ("DINNER", "20:40")
- the goal in words ("Lose weight + Build muscle")
- today's foods by name (so it does not offer them again)
- your usual meals (up to 8) and foods (up to 25), each with its usual amount,
  kcal and macros per 100 g, and how often you log it
- the note, if any, and the language

Nothing that says who you are: no name, email, id, record ids or dates. A test
serialises a real request and fails if any of those appear, as the week's
does.

## Architecture

```
Today ── TargetsCard ── <SuggestMeals> (today only, room left)
                          │ buildSuggestionRequest(targets, eaten, usuals, today's meals, note)
                          ▼                          src/domain/suggestions.ts (pure)
            FoodEstimator.suggestMeals(request) ── the same port as estimates and insights
               │ proxy (account)                │ own key (browser → OpenAI)
               ▼                                ▼
   estimate-food (fifth input: `suggest`)    openaiEstimator
     counted as TEXT, same ledger, same budget, same models
               └───── SUGGEST_SYSTEM_PROMPT (_shared/prompt.ts) ─────┘
                          ▼
            validateSuggestions (src/ai/validate.ts)
              recompute totals from the foods; drop impossible ones;
              at most 3; at most one New idea
                          ▼
            Log it → mealFromFoods(...) as an AI estimate → logMeal, Undo
            audit: AIInference purpose MEAL_SUGGESTION, the reply and the
            shape of what was sent (not the foods themselves)
```

- **Pure core:** `buildSuggestionRequest` picks the usual meals and foods
  (existing `findUsualMeals` / `findUsualFoods` over 90 days), works out
  per-100 g numbers, and trims to the limits. `fitOf(suggestion, left)` gives
  the fit line.
- **Validation is strict on numbers, soft on words:** a suggestion's totals
  are recomputed from its foods; a food with impossible numbers (more than 9
  kcal per gram, negative, or macros that add to more calories than stated
  by over 25%) removes that suggestion; an answer with none left is an error
  with Try again.
- **Server:** `estimate-food` gains a fifth input beside photo, text, report
  and leftover, bounded in size, counted as TEXT.
- **Reporting an answer** uses the existing "insight" report kind (both are
  advice), so no database change.
- **Policy and Terms** gain one line each: OpenAI also receives "what is left
  of your day and the foods you usually eat, when you ask what to eat", and
  "suggestions count as written analyses". That changes the Privacy Policy's
  version, so everyone is asked to agree again.

## Tests

- **Unit:**
  - the request is built from targets, usuals and today, within the limits
  - no identity in it
  - per-100 g numbers
  - the fit line (spare, short, over)
  - validation recomputes totals, drops impossible foods, keeps at most one
    New idea and three in all
  - the prompt's rules are present
  - the button's gate (room left, today only)
- **Server:** a suggest request is counted as TEXT and refused when the
  allowance is used.
- **Browser:**
  - the line and the button appear in the evening with room left, and not
    when on target
  - asking shows three suggestions from a faked model
  - Log it adds the meal and the targets move; Undo takes it back
  - the note is sent
  - out of analyses
  - Hebrew
  - the accessibility scan

## Not in this version

- Photos of the suggestion, recipes, shopping lists.
- Planning a whole day ahead.
- A suggestion offered by itself, without asking (a reminder could later say
  "300 kcal and 38 g protein left: want ideas?").
