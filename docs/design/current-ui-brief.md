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
| `/log` | **Default.** Three tabs — Photo, Write, Again — then an estimate, then Save |
| `/today` | The dashboard: nutrition, activity, recovery, body, meals, one AI card |
| `/nutrition` | Day totals, a manual meal form, the logged list with confirm, edit and delete |
| `/settings` | Account, API key, accuracy/speed, analysis, photos, storage |
| `/signin` | Emailed sign-in link. No passwords |
| `/training` `/recovery` `/body` `/health` | Still stubs, labelled with the slice that fills them |

**Navigation:** sidebar on desktop (Overview → Log, Today · Track → the rest ·
App → Settings); a bottom bar on mobile (Log · Today · Food · Settings). The
phone is the primary device — it holds the camera.

## The Log screen: three modes

A second row of tabs under the app's own navigation, and in this one case that
is the point. Photograph, describe and repeat are the same job with different
evidence, so putting them side by side lets each panel hold **one input and
nothing else**. What it replaced was a single screen stacking a repeat list
above a camera above a details form, where the thing you wanted was always
below the fold — and on a phone, often below the screen.

The tabs are a pill segmented control: **Photo · Write · Again**, Photo
selected by default. They disappear the moment something is being estimated.
The mode is in the URL (`/log?mode=write`), so it survives a reload and can be
linked to.

Subtitle under the title: "Three ways in. Photo is the default."

### Photo

1. The dashed camera panel, 4:3: "Take a photo / or choose one from your library".
2. An **"+ Add a note"** pill, and beside it: *"Optional, and it goes to the
   model with the photo — 'no oil', 'half portion'."* Tapping it opens a small
   textarea. This is the cheapest accuracy in the app: a photo cannot show how
   something was cooked or how much came back.
3. One repeat row — **"USUAL NOW · Eggs and oats · 560 kcal"** with a round
   terracotta **+** — then a line: *"The one thing you eat at this hour most
   often — one tap, no camera. Everything else you repeat is under Again."*
   One row is a shortcut; six rows were a decision.

### Write

A textarea placeheld with "two eggs on toast and a black coffee", a terracotta
**Estimate** button, and *"A couple of seconds, and a wider margin than a
photo."* Below, the last five things this device described, as chips with a
small × to forget one: *"Things you've described before, ready to send again.
Kept on this device only."*

The result is the same card as a photo's, with three honest differences: the
label reads **"Estimate from your words"**, item weights read *"assumed 170 g"*,
and a line says *"Confidence is lower than a photo's — nothing was seen, so
portions were assumed."* Above the card, the sentence sits in a pill with an
**Edit** button beside it.

### Again

Search first: a rounded field at the top, *"Search anything you've logged"*.
Typing searches everything ever logged rather than this hour's three rows.
Below it the usuals card ("Usual for breakfast"), the Yesterday section with
"Repeat the day · 3 meals", and the single-food chips — all as before.

**Usuals card** — up to three rows: the food names, a subline of "Yesterday,
07:38 · 200 g · logged 4× recently", and calories on the right. One tap logs
it. A row whose estimate was never confirmed says so. Empty search says
*Nothing logged matches "…"*.

**Yesterday** — small-caps section listing yesterday's meals with the time each
was eaten, and one button: **"Repeat the day · 3 meals"**. When some of
yesterday's meals are still ahead of the clock the button reads **"Repeat today
so far · 2 meals"** and a line underneath explains: "Later meals are left out
until their time comes round." Designing this omission as visible rather than
silent is the point — counting tonight's dinner at lunchtime would be
confidently wrong.

**Single foods, tap to add** — pill chips of one-item meals with their
calories. Multi-select, then "2 selected · 310 kcal → Log them". This is the
apple-and-a-coffee path that was never one meal.

Every repeat confirms with the same line and an **Undo**, which covers a whole
day's batch as one action.

## The Log screen, state by state

Beyond the three input panels, six states, all worth designing:

1. **Analyzing** — the photo dims and carries the status itself: "Reading your
   plate… 0:07 · usually about 15 seconds / You can leave — it keeps going".
   Honest about the wait; the best model really does take ~45 seconds. Text
   gets the same treatment in miniature: the sentence in its pill, a pulsing
   dot, "Working it out… 0:02".
2. **Result** — totals (calories, protein, carbs, fat), then per item: name,
   grams, `53P · 0C · 6F`, and a **confidence pill** (`72%`). Below that the
   model's assumptions as a bulleted list, a low-confidence warning under 50%,
   then **Save meal / Discard**.
3. **Exhausted** — "That was the last one on us." Explains the first 10 were
   free, offers *Connect my key* or *Log by hand instead*, and promises the
   input is kept.
4. **Error** — plain sentence plus retry; the photo, or what you wrote, survives.
5. **Saved** — brief confirmation with a link to Today.
6. **No key yet** — one-time setup card, only when nothing is being estimated.

**Optional details** (collapsed, under the input): what it is, total grams,
time, meal slot. Grams is the single biggest accuracy lever, and the UI says so.

## The Nutrition screen: fixing what you logged

Every logged meal carries two small round icon buttons beside its calories —
**pencil** and **trash**, hairline-bordered, 26px, the trash turning terracotta
on hover.

**Editing** opens a form in place of the row, on `surface` inside the card:

- Header: "Editing breakfast" · right-aligned "Logged 07:20, entered by hand"
  (or "estimated, not yet confirmed" / "from an estimate you confirmed").
- Per food: **Food**, then **Grams · Calories · Protein g · Carbs g · Fat g**.
  Changing Grams re-scales the rest by ratio and outlines the grams field in
  terracotta; the line underneath says *"Change the grams and the rest follows
  by ratio. Type over any number to break the link."* A "Remove this food" text
  link per item.
- Then **Meal** and **Time** for the meal itself.
- **Save changes** (terracotta) · **Cancel** · and pushed to the right,
  **Delete meal** in terracotta outline.

**Deleted** replaces the row with a quiet strip: *"**Breakfast deleted** · 560
kcal came off today's total"* with **Undo** and **Dismiss**. Nothing leaves the
database — it is a new version saying the meal did not happen — but the copy
speaks in the user's terms, not the model's.

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
- **Re-portioning by ratio** — change a logged meal's grams and its calories
  and macros follow, with the grams field outlined to say which numbers moved.
  Typing over any of them breaks the link; there is no mode to leave.
- **Delete that is really a new version** — "Breakfast deleted · 560 kcal came
  off today's total · Undo". Nothing leaves the database, and the copy says
  what the user cares about rather than what the storage does.
- **An estimate from words, labelled as weaker** — "assumed 170 g", lower
  confidence pills, and one line saying nothing was seen.
- **"Bring your data with you"** — after first sign-in, offers to move what the
  browser holds into the account.
- **Write failure banner** — "Couldn't save this meal… Try again", pinned above
  the bottom nav.
- **"Can't reach your data"** — a read that failed, with retry; never a blank
  day pretending nothing was logged.
- **One-time notices** — the accuracy/speed choice on first arrival, and the
  switch to a faster model when it happens.
- **Progress that survives leaving the screen** — the photo is replaced, not
  dimmed: a solid dark card with a spinning ring, "Reading your plate…", the
  elapsed time against "usually about 15 seconds", and a highlight sweeping
  down through it. **Cancel** and **Leave this open** sit right below (the
  latter goes to Today); a one-time leaf-toned card explains why the wait
  looks like this, the first time only. A **docked bar** above the bottom nav
  then follows you to any other screen: "Analyzing your lunch · 0:12 · View",
  then "Lunch estimated · 640 kcal · Review". Built because on a phone the
  running state didn't appear until you tapped something else — the file
  input's `change` handler was firing, but the screen showed nothing until the
  photo had been downscaled and hashed, both of which can stall for a beat
  right after the camera hands back control; the running state now shows
  immediately, on the photo as captured, before any of that work starts.

## The estimate card, now that it argues back

- **Editable in place** — "Adjust these numbers" turns the item rows into
  fields (food, grams, calories, protein, carbs, fat) plus "remove this food".
  Changing the grams re-portions the rest by ratio; each row shows what the
  model had said ("the model said 170 g · 281 kcal"). A corrected row is
  badged **"yours"** in sage instead of a terracotta confidence pill, because
  it is no longer an estimate.
- **A question from the model** — a bordered card *above* the numbers with one
  short question, a text field, **Send answer** and **Skip**. The copy makes
  clear the estimate below is already usable: "this is not a question you have
  to answer." Answering returns the screen to the analyzing state and comes
  back with firmer numbers. At most two per meal.

## Two languages, two directions

A **Language** card is the first thing in Settings — English / עברית — because
someone who cannot read the rest of the screen has to find it without reading
anything.

Choosing Hebrew stamps `dir="rtl"` on the document and the whole layout mirrors:
the sidebar moves to the right, padding and alignment flip, and the day arrows
reverse so "back" still points the way the reader came from. Numeric runs
(`53P · 0C · 6F`, `64 g`, `07:38`) stay left-to-right inside the mirrored page —
bidi would otherwise reorder them into nonsense. Model-authored text carries
`dir="auto"`, so an English food name in a Hebrew page still reads correctly.

Hebrew type falls through to Frank Ruhl Libre (display) and Heebo (sans), since
Fraunces and Inter have no Hebrew glyphs.

## Settings, in order

**Language** (English / עברית) · **Account** (signed in as … / not signed in) · **OpenAI API key** (with a
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
character, not an accident. "That was the last one on us." "Nothing was lost —
try again." "Showing Scale until you confirm one." "Confidence is lower than a
photo's — nothing was seen." "Later meals are left out until their time comes
round." Design should leave room for sentences like these; they are
load-bearing.

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
