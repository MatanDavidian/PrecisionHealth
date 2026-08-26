# Feature spec — repeat a meal, a food, or a whole day

**One line:** most days are not novel, so the app offers what you usually eat
*before* it offers the camera — one tap logs a meal you have eaten before,
with no photo, no waiting and no estimate to review.

Status: **built** (Aug 2026). Search and whole-day repeat completed the
picture; estimate-from-text landed with the Log modes and closed the last gap —
see [`log-modes-and-meal-edits.md`](log-modes-and-meal-edits.md).

---

## 1. Why this comes before better estimates

Photographing the same breakfast every morning costs about fifteen seconds of
waiting and roughly eleven cents of model spend to be told what the app already
knew. The habit that kills a food tracker is friction on the boring days, and
the boring days are most of them.

So repeats are a way in of their own — the **Again** tab — and the camera is
for food that is actually new. This is the cheapest feature in the product on
every axis at once: fewer taps, no wait, no API call, and an estimate that was
already reviewed once. Photo mode still carries the single most-repeated meal
for the current hour, because one row is a shortcut where six were a decision.

## 2. What counts as "usual"

`findUsualMeals` and `findUsualFoods` (`src/domain/usuals.ts`) read a **60-day
window** — long enough to see a habit, short enough to forget one. Meals are
grouped by **signature**: the item names, normalised and sorted, joined. So
"Eggs + toast" and "toast + Eggs" are the same usual, and 180 g of it is the
same usual as 200 g.

Ranked by count first, then recency. The slot being logged now filters the
first list; "See all usuals" drops the filter, and in the **Again** tab the
search box sits at the top and searches everything ever logged — someone
searching "porridge" at seven in the evening wants the porridge, not to be told
there is none for dinner.

Single-item meals additionally become **food chips**, which multi-select into
one snack — the path for "an apple and a coffee" that was never one meal.

## 3. What a repeat writes

A repeat is a **new meal record**, never a pointer to the old one. Same items,
same amounts, today's instant and zone, a fresh id.

Provenance is the part worth reading twice (`repeatedProvenance`):

- Repeating a meal you **already confirmed** writes `USER` / `RAW`. You have
  reviewed these numbers once; repeating them is a user entry.
- Repeating an **unconfirmed AI estimate** stays an `AI_ESTIMATE` with its
  original confidence, and still needs confirming. A guess does not become a
  fact by being copied.

Everything else the app already does — versioning, supersede chains, Undo —
applies unchanged, because a repeat is an ordinary meal.

## 4. Repeating a whole day

The "Yesterday" section lists yesterday's meals with the time each was eaten,
and one button copies them onto today, **each at its own time of day** rather
than all at the moment you tapped.

The rule that matters: **meals whose hour has not come round yet are left
out.** Copying tonight's dinner at two in the afternoon would add calories and
protein for food nobody has eaten, and a tracker that counts meals in advance
is not merely unhelpful — it is confidently wrong. When some are skipped the
button says "Repeat today so far" and a line explains why, so the omission is
visible rather than mysterious.

Retracted meals are excluded, and `repeatDay` returns the skipped ones
alongside the written ones so the UI can say what it did.

Undo covers the whole batch: one tap in, one tap out.

## 5. Relative days are calendar days

"Yesterday, 19:30" is decided by `daysBetween` on calendar dates, not by hours
elapsed. Opening the app at 00:40 and being told last night's dinner was
"Today" was wrong in the only way a time label can be.

## 6. Estimate from text — built

The gap this spec named is closed. Type "two eggs and a slice of sourdough" in
the **Write** tab and the same estimate comes back, through the same proxy,
prompt family and Confirm flow; only the input differs, and the confidence is
honestly lower because nothing was seen. Details in
[`log-modes-and-meal-edits.md`](log-modes-and-meal-edits.md) §3.

## 7. Still to build

**Ranking that learns from what you skip.** A suggestion offered and ignored
twenty times should stop being offered. Count-then-recency is predictable,
which is why it was chosen, but it cannot notice that you have moved on.
