# What the app looks like now — a brief for the design agent

Paste this into the Claude Design project (with the repo connected via "Start
from code") to bring the mockups up to date. Regenerate it whenever the UI
moves on: it is a snapshot, not a spec.

Read `src/styles.css` for tokens and `src/ui/` for the real components — the
code is the source of truth, and this is the map.

---

## The shape of the app

**Six screens.** `/log` is the front door — not Today, as the original mockups
assumed.

| Route | What it is |
|---|---|
| `/log` | **Default.** What you usually eat, then the camera; then an estimate, then Save |
| `/today` | The dashboard: nutrition, activity, recovery, body, meals, one AI card |
| `/nutrition` | Day totals, a manual meal form, the logged list with confirmations |
| `/settings` | Account, API key, accuracy/speed, analysis, photos, storage |
| `/signin` | Emailed sign-in link. No passwords |
| `/training` `/recovery` `/body` `/health` | Still stubs, labelled with the slice that fills them |

**Navigation:** sidebar on desktop (Overview → Log, Today · Track → the rest ·
App → Settings); a bottom bar on mobile (Log · Today · Food · Settings). The
phone is the primary device — it holds the camera.

## The Log screen, above the camera

The camera is no longer the first thing on the screen. Repeats are, because
most days are not novel and photographing the same breakfast again costs
fifteen seconds and about eleven cents to learn nothing.

**Usuals card** — heading "Usual for breakfast" (the current slot, in words),
then up to three rows: the food names, a subline of "Yesterday, 07:38 · 200 g ·
logged 4× recently", and calories on the right. One tap logs it. A row whose
estimate was never confirmed says so.

**See all usuals** — a text link that swaps the card to "Everything you log"
and reveals a **search field** ("Search anything you've logged before")
matching across every meal and food ever logged.

**Yesterday** — a small-caps section listing yesterday's meals with the time
each was eaten, and one button: **"Repeat the day · 3 meals"**. When some of
yesterday's meals are still ahead of the clock the button reads **"Repeat today
so far · 2 meals"** and a line underneath explains: "Later meals are left out
until their time comes round." Designing this omission as visible rather than
silent is the point — counting tonight's dinner at lunchtime would be
confidently wrong.

**Single foods, tap to add** — pill chips of one-item meals with their
calories. Multi-select, then "2 selected · 310 kcal → Log them". This is the
apple-and-a-coffee path that was never one meal.

The whole card is absent for a new user with no history — nothing to repeat
yet, so the camera is the first thing after all.

Every repeat confirms with the same line and an **Undo**, which covers a whole
day's batch as one action.

## The Log screen, state by state

Six states, all worth designing:

1. **Idle** — a dashed camera panel below the usuals: "Take a photo / or choose one from your library".
2. **Analyzing** — "Reading your photo… the most accurate model thinks for up to a minute." Honest about the wait; the best model really does take ~45 seconds.
3. **Result** — totals (calories, protein, carbs, fat), then per item: name, grams, `53P · 0C · 6F`, and a **confidence pill** (`72%`). Below that the model's assumptions as a bulleted list ("Assumed cooked weights", "No added oil visible"), a low-confidence warning under 50%, then **Save meal / Discard**.
4. **Exhausted** — "That was the last one on us." Explains the first 10 were free, offers *Connect my key* or *Log by hand instead*, and promises the photo is kept.
5. **Error** — plain sentence plus retry; the photo and details survive.
6. **Saved** — brief confirmation with a link to Today.

**Optional details** (collapsed by default, under the photo): what it is, total
grams, time, meal slot. Grams is the single biggest accuracy lever, and the UI
says so.

## Concepts the original mockups could not have anticipated

These are the ones most worth real design attention — they are what makes the
app itself rather than a generic tracker:

- **Confidence pills** on every AI-estimated item (38%–80% in practice, and
  honestly varied).
- **"AI estimate 72%" badge** plus a **Confirm** button in the Nutrition list —
  confirming replaces the estimate without double-counting.
- **"Two sources disagree"** — a scale and a phone reporting different weights;
  the user picks, and their choice becomes the truth.
- **"This meal was edited in two places"** — the same meal edited on two
  devices; both versions offered, neither destroyed.
- **"Bring your data with you"** — after first sign-in, offers to move what the
  browser holds into the account.
- **Write failure banner** — "Couldn't save this meal… Try again", pinned above
  the bottom nav.
- **"Can't reach your data"** — a read that failed, with retry; never a blank
  day pretending nothing was logged.
- **One-time notices** — the accuracy/speed choice on first arrival, and the
  switch to a faster model when it happens.
- **Progress that survives leaving the screen** — the photo dims with "Reading
  your plate… 0:07 · usually about 15 seconds / You can leave — it keeps going",
  and a **docked bar** above the bottom nav follows you to any other screen:
  "Analyzing your lunch · 0:12 · View", then "Lunch estimated · 640 kcal ·
  Review". Built because on a phone the wait was invisible and looked like
  nothing had happened.

## Settings, in order

**Account** (signed in as … / not signed in) · **OpenAI API key** (with a
three-step "don't have a key yet?" guide when empty) · **Accuracy or speed**
(the trial model picker) · **Analysis** (model + auto-analyze) · **Photos**
(never saved) · **Where your data is saved** (browser vs account).

The **accuracy/speed picker** is three radio rows, one of which can be locked:

| | |
|---|---|
| **Most accurate** · `3 left` | Reads a crowded plate carefully. Up to a minute. |
| **Balanced** | Good estimates in about fifteen seconds. |
| **Fastest** | Quick and rough. Best for simple, obvious meals. |

When the best model's budget is spent it shows `used up` and greys out.

## Voice

The copy is plain, specific and admits limits — that is the product's
character, not an accident. "That was the last one on us." "Not built yet."
"Nothing was lost — try again." "Showing Scale until you confirm one." Design
should leave room for sentences like these; they are load-bearing.

## Tokens, exactly

```
canvas      #f1ece1     ink         #2b2721
surface     #faf7f0     ink-muted   #8a8375
card        #e8e1d1     hairline    #ddd4c2
card-soft   #eee8da     accent      #c2673e   (terracotta: primary actions, warnings)
leaf        #6f7f53     accent-soft #e8d3c4
leaf-soft   #eaf1da     (leaf: success, the AI card)
```

Display font **Fraunces** (headings), body **Inter**. Card radius **20px**.
Numbers use tabular figures so columns line up.
