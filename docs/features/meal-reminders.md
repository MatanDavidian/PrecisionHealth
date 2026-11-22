# Feature spec — meal reminders, with your usual meal in one tap

**One line:** three more reminders, for breakfast, lunch and dinner, each
at its own time, each offering the meal you usually eat then as a button:
one tap logs it.

Status: **built 2026-11-22, live after the Privacy Policy change below.**
Builds on [`reminders.md`](reminders.md) (the machinery, and the evening
reminder, which stays). Owner's choices, 2026-11-22: the top meal as a
button plus a quick sheet; the evening reminder kept.

---

## What it does

- **Three reminders, each on or off, each with its own time:**
  - Breakfast, 05:00–11:45 (default 08:30)
  - Lunch, 11:00–16:45 (default 13:30)
  - Dinner, 17:00–23:45 (default 20:00)

  A reminder comes only if that meal is not logged yet that day. A day set
  in one tap counts as logged.
- **On the notification** ("Lunch? Log it in one tap."):
  - **Your usual lunch, as a button** ("Chicken, rice, tahini"). Tapping
    it opens the app, which logs it and says "Logged ✓ · Undo".
  - **"Something else"** opens the quick sheet.
  - **Tapping the notification itself** also opens the quick sheet.
- **The quick sheet** (`/quick?slot=LUNCH`):
  - your top three for that meal, each one tap to log
  - **Write it**, which opens Log in Write mode
  - **Take a photo**
- **The evening reminder stays** ("nothing logged today"), as before.

### What the platforms allow, and why it is this shape

- **Buttons:** Chrome shows at most two buttons on a notification (on
  Android and on a computer), and iPhone shows none. So: one meal and
  "Something else", with the other two meals one more tap away. On iPhone,
  tapping the notification opens the sheet.
- **The app opens for a moment.** A notification cannot sign in, so it
  cannot write to the account by itself.

## UX

- **Settings → Reminders.** Above the evening reminder, three rows, each a
  switch, its time, and a note ("Only if breakfast is not logged by then").
  The two existing rows stay as they are.
- **The quick sheet** is a plain page, made for one thumb:
  - a heading: "Lunch"
  - three wide buttons, each with the meal and its calories
  - then "Write it" and "Take a photo"
  - with nothing usual yet: "Nothing usual yet for lunch", and the two ways
    to log it

  After a tap: "Logged: Chicken, rice, tahini · 690 kcal", with **Undo**
  and **Done** (Done goes to Today).
- **One tap logs once.** A notification button carries a one-time mark. If
  the page is reloaded, or the button tapped twice, the second tap shows
  the same confirmation and logs nothing more.

## Privacy

The button's label is a meal's name ("Eggs and oats"): food on a lock
screen, encrypted on its way through the push service. The Privacy Policy
says the message "says only that it is time to log", so it changes (version
2026-11-22, everyone asked to agree again):

> … an encrypted message it cannot read, which says it is time to log and,
> for meal reminders, names your usual meal for that time.

## Architecture

```
the app (on open, when a meal reminder is on)
  findUsualMeals per slot, top 3 ──► user_preferences.reminder_usuals
                                      {BREAKFAST:[{key,name,kcal}], …}
send-reminders (every 15 min)
  per slot switched on: due now? slot not logged today? claim it (once a day)
  message: title, body, actions [usual, other], urls {open, usual}
service worker
  showNotification with the actions (as many as the platform allows)
  a tap: the action's url, or the sheet
/quick?slot=LUNCH[&log=<key>&once=<mark>]
  findUsualMeals(slot, 3) from the store; logRepeat; Undo
```

- **The app works out the usual meals, not the server.** The rule already
  exists in the app (`findUsualMeals`, by meal time, most repeated first);
  writing it again for the server would be two rules to keep in step. The
  app saves the top three per meal with the reminder settings each time it
  opens, so a button is at most as old as the last visit. The key is the
  meal's signature (its foods), which the sheet looks up again among the
  current usuals.
- **Schema** (migration 0019): on `user_preferences`, `breakfast_reminder`,
  `lunch_reminder`, `dinner_reminder` (each off by default) with their
  times, checked to their windows, and `reminder_usuals` (jsonb, size
  bounded); `reminder_log.kind` allows BREAKFAST, LUNCH and DINNER.
- **Rules** (`_shared/reminderRules.ts`, pure):
  - `dueDay` gains a same-day mode: due from the time, for 90 minutes
  - `slotLogged` asks whether a live meal in that slot exists, or a
    set-day estimate
  - `slotMessage` builds the words, the buttons and the addresses
- **The one-time mark** is the day and the slot. The sheet keeps the marks
  it has used in the browser, and also checks whether that meal was already
  logged in that slot today.

## Tests

- **Unit:**
  - each slot's window and time zone
  - a slot logged, a deleted meal, a set day
  - the message with and without usual meals, Hebrew
  - the usual meals per slot that the app saves
  - the size bound
- **Database:** the new windows refuse wrong times; the new kinds; once a
  day per slot.
- **Server:** a due lunch with nothing logged sends, with the stored usual
  as its button; a logged lunch does not; each slot claimed separately; the
  evening reminder unaffected.
- **Browser:**
  - Settings' three rows save
  - the sheet lists the usuals for the slot and logs one in one tap, with
    Undo
  - an address carrying a meal logs it once, and a reload logs nothing more
  - Write it opens Write mode
  - Hebrew; the accessibility scan
