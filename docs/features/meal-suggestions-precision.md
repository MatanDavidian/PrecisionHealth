# What to eat now: the precision design

**One line:** a suggestion is only as good as the numbers under it. This
document says what Vimetry knows about the person's day and week (what they
ate, what they burned, how they trained, what they are aiming for), how sure
it is of each number, and how those numbers decide whether to suggest
anything, how much, and what kind of food.

Status: **design, 2026-11-26.** Written after the owner's evening of
2026-11-26: 326 kcal over today, 11 g of protein short. The card said "the
week is 89 kcal over its targets: better to stop", while the week view said
"you ate 1,637 kcal less than you burned". Both were right, and that is the
problem this document starts from. What is built is in
[`meal-suggestions.md`](meal-suggestions.md). This document is what comes
next, in [phases](#9-phases), each for the owner to approve.

---

## 1. What "precise" means here

Four promises, in order:

1. **The numbers are the person's.** Their burn as their watch measures it
   (or as their body predicts it), their usual foods and portions, their
   goal. Never a population average when a personal figure exists.
2. **The app does the arithmetic, the model chooses the food.** How much
   room there is, how much protein is wanted, the most calories a
   suggestion may have: worked out by rules in the app, testable and
   explainable. The model only picks foods that fit, from the person's own
   first, and its numbers are checked again.
3. **It never claims more precision than it has.** A day with thirteen
   unconfirmed photo estimates is a day known to about ±15%. "89 over" for a
   week of 10,000 kcal is "on target", not a reason to refuse.
4. **It is honest when the answer is "nothing".** No compensating, no
   fasting advice, no food after the day is truly full. "Stop for today" is
   a valid suggestion, with its reason.

## 2. What the app knows, and how well

| Input | Where it comes from | How sure | Built? |
| --- | --- | --- | --- |
| **Eaten today** | Logged meals: by hand, by photo, in words, repeated | Typed by hand or confirmed: sure. Unconfirmed photo or text estimate: about ±20% each | ✅ |
| **Eaten earlier this week** | The same, plus days set in one tap (quick-set) | As above; a quick-set day is a rough estimate by design | ✅ |
| **A day only partly logged** | Breakfast logged, nothing after | Not known today: it looks like a day of under-eating | ◻ §6.3 |
| **Burn on past days** | Watch's total for the day (`TOTAL_ENERGY`), or typed on Today | A wrist watch's energy figure can be off by 20% or more, but it is the same watch every day, so day-to-day differences are meaningful | ✅ (§4.2) |
| **Usual burn** | Average of the watch's last 28 days (5 or more), else a formula: weight, height, age, sex × how active a day is | Watch: good. Formula: ±10–15% for most people | ✅ |
| **Burn today so far** | The watch's running total and active calories, as synced | Partial until the day ends | ◻ §4.3 |
| **Training today** | Workouts: kind, minutes, active calories | Kind and length: sure. Active calories: a watch's estimate | ✅ (shown, sent) ◻ (counted) |
| **Goal** | Two answers: the weight (lose, keep, gain, none) and what else (muscle, fat, fitness) | Sure | ✅ |
| **Weight trend** | Weigh-ins | One weigh-in is noisy (water, salt); a two-week trend is not | ◻ §4.5 |
| **Usual meals and times** | The last 60 days of meals | Good after two weeks of logging | ✅ |
| **Sleep** | Watch sleep records | Good | ◻ §5.4 |
| **Preferences** | Settings → Goals | Sure | ✅ |

## 3. The two numbers that confused, explained

On 2026-11-26 (watch: 2,410 kcal a day, goal: lose weight, so the target is
2,410 − 350 = **2,060**):

| | kcal |
| --- | --- |
| Sunday to Wednesday, **eaten − burned** (the week view) | −1,637 |
| The planned cut, 4 days × 350 | +1,400 |
| Sunday to Wednesday, **eaten − targets** | −237 |
| Today, 2,386 eaten − 2,060 target | +326 |
| **The week against its targets** (the card) | **+89** |

The week view answers "did I eat less than I burned?" (yes, by 1,637). The
card answers "am I on my plan to lose weight?" (yes, to within 89 kcal).
**Both stay**, but the card must say which question it answers, and 89 of
10,000 is not a refusal (§6.1).

## 4. The energy model

### 4.1 Today's budget, as built

```
target today = usual burn + the goal's balance        (floor 1,200 / 1,500)
usual burn   = the watch's 28-day average, or the formula
balance      = −500 lose weight · −350 lose fat · 0 keep · +250 gain
```

### 4.2 A past day's budget, as built

What the day **really burned**, plus the goal's balance, when a burn was
recorded and believable (at least 60% of the usual: below that, a watch that
stopped counting). Otherwise its target. A long run on Tuesday leaves room
that Tuesday's average target would not.

### 4.3 Today's training, counted ◻

Today's burn is not finished, so today keeps its target, **except** for
training beyond the usual:

```
extra today   = active calories so far today − the usual day's active calories
credit        = 50% of the extra, when it is positive
today's room  = target − eaten + credit
```

- **Only beyond the usual.** The usual burn already includes a usual day's
  training; counting a usual workout again would count it twice.
- **50%, not all of it.** Wrist watches overestimate exercise calories, and
  "eating back" all of them is the commonest way a deficit disappears.
  Half is the cautious figure many coaches use. *For the owner: 50%, 75% or
  100%?*
- **Never downwards during the day.** A quiet morning is not a quiet day.
  The day is settled with its real burn once it is over (§4.2).
- **Shown:** "62 min of strength training today, 380 kcal more than usual:
  190 of it is counted."

### 4.4 The week, rolling ◻

Today the week is the calendar week, from Sunday. On a Sunday there is no
week at all, and Saturday's overeating is forgotten overnight.

**Proposed: the last 7 days**, today and the 6 before it, each day against
its budget (§4.2), today against its target and credit (§4.3). The card says
"last 7 days". The week view keeps its calendar weeks: it is a record, and
this is a decision.

How the week changes today:

- **Over beyond the tolerance (§6.1):** spread it over the days to come.
  Today's room goes down by the overage ÷ 3, at most 300 kcal. Never all of
  it today, and never below the floor: a bad Saturday is not a reason to
  starve on Sunday.
- **Under beyond the tolerance:** today may use some of it, up to 250 kcal,
  for protein first. Never pushed: under-eating on a losing goal is ahead of
  plan, not a debt.

### 4.5 Learning the real burn from the weight ◻

The most personal number there is: if the person logs most of what they eat
and weighs in a few times a week, the weight trend says what they really
burn.

```
real burn ≈ average eaten − (weight trend change in kg × 7,700) ÷ days
```

- Needs at least 14 days with logging, and 6 weigh-ins across them, and
  uses a smoothed trend, never two single weigh-ins (water moves a kilo a
  day).
- When it differs from the watch or the formula by more than 10%, the app
  **asks** rather than switches: "Your weight trend says you burn about
  2,250 a day, not 2,410. Use 2,250 for your targets?"
- Also corrects the watch's bias for that person, which no average can.

## 5. Macronutrients

### 5.1 Protein first ✅

The daily target is by weight and goal (1.6–2.0 g per kg; built). For a
suggestion:

- The gap is closed first, with the most protein per calorie when calories
  are short.
- **One sitting is about 0.3–0.5 g per kg** (25–40 g for most people).
  A 70 g gap at 21:00 is not closed in one snack; the card says what is
  closed now and that the rest is for tomorrow's breakfast. ◻
- The week's protein matters: a week ahead means today's small gap can wait
  (built).

### 5.2 Fat ◻ (partly ✅)

- The week over on fat: lean suggestions (built).
- **A floor:** a week averaging under 0.5 g per kg a day gets suggestions
  with some fat (olive oil, nuts, eggs), because too little fat is a real
  problem on long deficits.

### 5.3 Carbs, by training ◻ (partly ✅)

- After **endurance** training (running, cycling, swimming, 60 minutes or
  more): carbs are part of the answer, not the leftover.
- After **strength** training: protein first, moderate carbs (built in
  words).
- **A rest day:** carbs modest.

### 5.4 The time, and sleep ◻

- **Within 3 hours of the person's usual bedtime** (from the watch's sleep):
  light, at most 400 kcal, slow protein (cottage cheese, yogurt), nothing
  heavy or spicy.
- **The usual meals still to come** keep their room (built).

## 6. Being honest about uncertainty

### 6.1 A tolerance, not a cliff ◻

A decision should not flip on a number smaller than the noise.

- **The week is "on target"** within ±max(150 kcal, 3% of its budget). The
  owner's 89 of ~10,000 is on target, so a protein snack is fair, not
  "stop".
- **Today is "used"** under 100 kcal left (built).

### 6.2 Estimates in the day ◻

With unconfirmed estimates in today's log, the card says so: "About 2,386,
13 foods are estimates". When the decision would change within ±15% of
those estimates, the card prefers the cautious side and says "review them
in Nutrition for a firmer answer".

### 6.3 A day partly logged ◻

A past day under 50% of its target, and not set in one tap, is probably a
day not fully logged. It is left out of the week, as an empty day is, and
the card says "Tuesday looks partly logged: not counted". Otherwise one
forgotten dinner would buy a large snack days later.

### 6.4 What the app never does

- Never suggests making up for overeating by skipping meals or fasting.
- Never goes below the floor (1,200 / 1,500 kcal a day), and never suggests
  below it for a day.
- Never suggests supplements or medication; never comments on the body.
- Never pushes food on someone under their target ("you have 900 left, eat
  it"): room is an offer, not an order.

## 7. Who decides what

| Decision | Who | Why |
| --- | --- | --- |
| Whether to offer anything, and the plan (fill, wait, protein snack, stop) | **App**, by rules | Must be predictable, testable and explainable |
| The calorie cap, the protein wanted, the slot | **App** | Arithmetic belongs where it can be tested |
| Which foods, how much of each | **Model**, within the caps | Knowledge of food, portions and combinations |
| Whether the model's numbers are real | **App** checks again | Totals recomputed; impossible foods dropped; over the cap dropped |
| Preferences | **Rules the model must follow**, checked where they can be (§10) | |

## 8. The card, revised ◻

- **Two clear lines:** "Today: 326 over your target" and "Last 7 days: on
  your plan (89 over, within the margin)". A link, "Why two numbers?",
  opens §3's table for the person's own week.
- **The training line** says what was counted: "380 kcal more than usual
  today: 190 counted".
- **Estimates** marked "about" when unconfirmed foods are in the day.
- **The answer** names the numbers it used: "For 250 kcal and 25 g of
  protein: what your week allows tonight".

## 9. Phases

| Phase | What | Why first | Size |
| --- | --- | --- | --- |
| **1. Honest numbers** | Tolerance band (§6.1); "against your plan" wording and "Why two numbers?" (§3, §8); partly logged days left out (§6.3); estimates marked (§6.2) | Fixes the evening that started this; small | S |
| **2. Training counted** | Today's credit for extra training (§4.3); carbs by kind of training (§5.3); protein per sitting (§5.1) | The person's own burn, today | M |
| **3. The rolling week** | Last 7 days instead of the calendar week (§4.4), with the overage spread | No Sunday blind spot | S–M |
| **4. Sleep and fat** | Bedtime rule (§5.4); fat floor (§5.2) | Better food, not more numbers | S |
| **5. Learning the real burn** | Weight trend calibration, asked, never silent (§4.5) | The most personal number; needs weeks of data, so it can come last | M–L |

## 10. Tests, for every phase

- **Unit, for every rule:** each row of every table above as a test, with
  the numbers in this document (the owner's evening is a test case: 89 over
  is on target).
- **Browser:** each plan as a written week
  ([`e2e/meal-suggestion-scenarios.spec.ts`](../../e2e/meal-suggestion-scenarios.spec.ts),
  21 scenarios today), extended per phase.
- **Preferences:** a check on the model's answer where the rule can be
  checked by words: a vegetarian answer naming chicken, tuna, beef or fish
  is dropped, as an impossible number is.

## 11. Questions for the owner

1. **How much of extra training counts:** 50% (cautious), 75%, or 100%?
2. **The week:** the last 7 days (proposed), or the calendar week as now?
3. **The margin:** ±max(150 kcal, 3%), or wider?
4. **Weight trend:** offer the correction when it differs by 10% or more
   (proposed)?
5. **Which phase first:** 1 is proposed; it is the one that would have
   changed tonight's answer.
