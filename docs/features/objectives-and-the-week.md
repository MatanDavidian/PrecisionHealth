# Feature spec — what you are working towards, and how the week went

**One line:** a goal becomes one of five programmes rather than a number, and a
Day/Week toggle on the dashboard shows eaten against burned across seven days
with a verdict against that programme.

Status: **built** (Aug 2026). AI insights on the week are designed and
deliberately not built — see §6.

---

## The week is a calendar week

Sunday to Saturday, not the seven days ending today. The reason is insights
rather than tidiness: **a rolling window cannot own one.** Generated on a
Wednesday it describes Thu–Wed, and by Thursday that same "this week" means a
different set of days — so a saved insight would quietly stop matching what is
on screen. A calendar week is a stable, nameable thing, which is what makes
saving possible at all. It is also what makes "previous week" mean anything: a
rolling window has no natural step size.

`WEEK_STARTS_ON` is a constant rather than a setting. Nobody has a second locale
to serve, and a preference nobody asked for is a branch to maintain and a screen
to explain — but it is named, so the day it becomes one there is a single place
to change.

Selecting a day and switching to the week shows **the week that day is in**.
Before, the two views disagreed about what you were looking at.

## The net compares like with like

The balance counts only days carrying **both** figures. Summing all the eating
against only the days that reported a burn is not a comparison, it is a bias —
and a large one. A watch sends completed days, so today never has a burn figure,
and every week counted one extra day of food against nothing.

On a real week that turned a deficit of about 1,400 kcal into a surplus of 976:
not merely imprecise, **the wrong sign**. `eatenAllDays` still reports everything
eaten, because it was eaten; it just cannot be half of a balance.

## A goal with no target still says when something is happening

`FITNESS` stays `UNGRADED` — scoring someone against a target they never set is
inventing one for them, and that remains true. But "you are not being scored" is
not "nothing here is worth knowing". Past `NOTABLE_DRIFT_KCAL` (3,500, roughly
half a kilo) the week says so as an **observation**, never a pass or a fail, and
never beside a goal that already has a verdict.

## 1. Why a goal needed a shape

A target weight says where you want to end up and nothing about how. "75 kg" is
the same number whether you are cutting hard or slowly recomposing, and it
cannot answer the question a dashboard exists to answer: *was this week any
good?*

So a goal became an **objective** — one of five programmes, each carrying the
daily energy balance it implies:

| Objective | Daily aim | Wants a target weight |
|---|---|---|
| Lose weight | −500 kcal | yes |
| Lose fat, keep muscle | −350 kcal | yes |
| Build muscle | +250 kcal | yes |
| Keep this weight | 0 kcal | no |
| General fitness | none | no |

Five, and coarse on purpose. A slider from −1000 to +1000 would be more
expressive and would ask a question nobody can honestly answer about
themselves. These are the intents people actually hold, each at a rate that is
defensible rather than optimal — 500 kcal is roughly half a kilo a week, the
number every dietician starts from.

**"No calorie target" is `null`, not zero**, and the distinction runs the whole
way through. "Eat what you burn" and "I am not counting" are different answers
and grade differently.

## 2. Grading, and refusing to

`verdictFor` is asymmetric, because the errors are not symmetric:

- A **deficit** target is a ceiling. Going further under it is a harder week,
  not a failure, so only overshooting counts against you.
- A **surplus** is the mirror.
- **Keep this weight** is the only one graded in both directions, within 100
  kcal a day, because there both errors are the same error.
- **No target** is `UNGRADED` — not passed. Scoring someone against a target
  they never set would be inventing one for them.

The same instinct governs missing data. A day with no burned figure is left
`undefined` rather than zeroed: averaging it in would turn a missing
measurement into a claim about the body. The week's target is then **scaled to
the days that actually reported**, and the screen says so — grading four days
against a whole week's target would manufacture a deficit out of nothing but
absence.

## 3. Day and Week

One segmented control in the header, two words, and the title changes with it:
"Today" becomes "This week", and the date becomes a range. The day arrows
disappear in week view, where they would mean nothing.

The view lives in the URL (`/today?view=week`), so it survives a reload and can
be linked to — the same reasoning as the Log screen's three modes.

The week is **loaded only when it is looked at**. Seven days is eight reads, and
doing them on every day view to fill a card nobody opened would be paying for
the feature whether or not it gets used.

## 4. The chart

Two bars a day, not one net bar. A net figure hides whether a small deficit
came from eating little or moving a lot, and those are different weeks with
different advice attached to them.

An **unlogged day is a hairline**, not a missing column: the gap is information,
and an absent bar reads as a chart bug rather than as "you logged nothing on
Tuesday".

Drawn with divs. Fourteen rectangles and a baseline do not justify a charting
dependency, and the one thing a library would add — axes and ticks — is exactly
what this design does without.

## 5. Where the numbers live

**Superseded (Aug 2026).** These four briefly shared one card at the top of the
day view. That was wrong, and the owner said so: it put the parts that never
change — your goal, your target — at the top of the screen you open most often,
and made the dashboard shout about them.

They are split by how often they move:

- **Today → Activity** keeps *Burned, total*, because it is a fact about a day
  and you set it daily.
- **Settings → You** keeps the goal and both weights, because they are facts
  about a person that you set once and revisit rarely.

The balance strip went with the card. It is no loss: the week view answers "am
I ahead or behind" over a span where the question actually means something,
and a single day's net is mostly noise.

### One quantity became two

The design showing *Active kcal* and *Burned, total* as separate rows made an
error visible that had been there since the manual-entry slice: they are
different numbers. Active energy is what a tracker reports for movement; total
expenditure includes resting metabolism, which is most of it — roughly 1,500
kcal a day for an adult.

Conflating them meant a tracker's active figure would have been compared
against food intake as if it were total burn, understating expenditure by more
than a meal a day and making every week read as a surplus. `TOTAL_ENERGY` is
now its own observation code, and it is the one the week measures against. A
test pins the distinction.

**Steppers, not text fields.** These numbers move by small known amounts from
where they already are — 79.4 to 79.3, never to something unrelated — so a
keyboard is the wrong instrument. Typing still works; it is the escape hatch
rather than the tool.

**One write per settled value.** A stepper fires on every tap and every write is
an append-only record, so five taps would leave five observations, four of them
meaningless. `useNudged` shows every tap and stores the last one.

> Found in the browser: React error #310. The three nudge hooks sat after
> Today's early returns, so the first render bailed out with none of them and
> the next called three. Hooks cannot live after a conditional return.

## 6. Insights — designed, not built

The week view carries a disabled "Ask for insights" with a *not built yet*
badge, and copy that states the contract plainly: **"Nothing is sent until you
ask."**

That sentence is the feature's whole design, and it is why the button is
present while disabled rather than absent. Sending a week of someone's eating
to a model is a thing that should be visibly opt-in, at the moment they opt in,
and building the button before the sending forces the promise to be written
down first.

## 7. Tests

- **Objectives**: aims scale by days; `null` and `0` stay distinguishable;
  deficits graded as ceilings, surpluses as floors, level in both directions;
  no target means ungraded; only the scale-facing objectives want a target
  weight.
- **The week**: seven days ending on a date, crossing a month; totals and net;
  days without a burn excluded from both the total and the day count; the aim
  scaled to reporting days; ungraded when no burn or no objective; an empty week
  does not divide by zero; the chart's peak never returns zero.

Driven in a browser with a fabricated week: fourteen bars at correct heights, a
+910 net against a −3,500 aim reading "4,410 kcal short", the range as
"Aug 22 – Aug 28, 2026", and the same screens clean in Hebrew with the chart
mirrored and Hebrew weekday initials.
