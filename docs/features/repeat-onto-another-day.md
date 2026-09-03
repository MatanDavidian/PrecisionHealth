# Feature spec — repeat a usual meal onto another day

**One line:** the add-meal sheet gains a third mode, beside Manual and Describe,
that repeats a meal you have logged before onto whichever day is on screen.

Status: **specified, not built.** Epic E1 in [`../PHASE-1.md`](../PHASE-1.md).

---

## Why

Three ways to add a meal already exist, and they do not line up:

| | Log screen | Add-meal sheet |
| --- | --- | --- |
| Photograph | yes | — |
| Describe in words | yes | **yes** |
| Type the numbers | — | **yes** |
| **Repeat a usual** | **yes — today only** | **missing** |

The Log screen's **Again** repeats a usual onto *today*, because the whole Log
screen means now. The sheet works on any day. The intersection — *repeat
something I eat often, onto the day I forgot to log it* — is the one
combination the app cannot do, and it is the likeliest reason to be looking at
yesterday in the first place.

The machinery all exists. `mealSignature` and the usuals ranking were built in
slice 3.6; the sheet's mode toggle was built for Describe; `addMeal` already
takes the day. This is composition, not construction.

---

## What it does

A **Repeat** pill joins Manual and Describe. Choosing it lists the usuals — the
same ones the Log screen offers — and picking one writes that meal onto the
selected day.

The meal is a **new record**, not a reference to the old one. It carries the
same foods and numbers, and `userEntered` provenance at the new day's instant.
The original is untouched. Two dinners a week apart are two meals that happen to
be identical, and modelling one as a pointer to the other would make editing one
silently edit the other.

### Ranking

The Log screen ranks usuals by what you eat *at this hour*. The sheet should
rank by **the hour being logged**, not the hour it is now: adding yesterday's
breakfast at nine in the evening should still offer breakfasts.

The slot and time controls already in the sheet supply that hour, so the ranking
follows the form rather than the clock.

### What it does not do

- No AI. A repeat is a copy of numbers already agreed; sending it to a model
  would spend a trial analysis to be told what the record already says.
- No editing in the list. Pick, save, then edit it like any other meal — the
  editor already does that better than a second form would.

---

## Tests

**Unit** — the ranking prefers usuals matching the slot being logged rather than
the current hour.

**Browser** —
1. Step back a day, Repeat, pick a usual, and it lands on that day.
2. Today's total does not move.
3. The repeated meal is editable, and editing it leaves the original alone.

---

## Open

**Q12 — cross-language usuals.** A usual is identified by its normalised item
names, so `Porridge` and `דייסה` are two different usuals for one breakfast.
Repeat makes that more visible than Again did, because the sheet is where
someone works through a backlog.

Not this feature's bug, and not this feature's fix — the real answer is a
language-independent food identity, which is the same work as the food-database
path already parked in the roadmap. Phase 1 should decide whether to fix it or
write it down; it should not discover it in use.
