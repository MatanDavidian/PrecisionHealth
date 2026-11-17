# Feature spec — reminders

**One line:** a daily reminder to log meals when nothing is logged by an
hour the person chooses, and a reminder to sync the watch when days of
calories burned are missing.

Status: **documented for later, nothing built** (2026-11-17, the owner's
decision). Epic 6 in [`../ROADMAP.md`](../ROADMAP.md). Analysed the same day;
the findings are kept here so the work can start from them.

---

## 1. The daily meal reminder

**What the owner asked for:** a notification every day at a time set in
Settings, between 16:00 and 04:00, default 22:30, sent only if no meal has
been logged by then. Tapping it opens Today, where the day can be logged or
set in one tap (`quick-set-a-day.md`).

### Why it is the largest of the three

The app has **no notification machinery** today: the service worker
(`public/sw.js`) only caches files. And a web app cannot reliably set an
alarm on the phone for itself (the browser feature that would have allowed
it was abandoned). So the reminder has to be **sent from the server** at the
right moment, as a web push:

- **Permission and subscriptions:** a Settings switch that asks the device
  for permission and stores where to send (a new table, one row per device,
  removable).
- **Keys:** a key pair for web push, the private half as a Supabase secret.
- **A scheduler:** a job every 15 minutes (Supabase's scheduled jobs, or the
  existing GitHub Actions schedule) that calls a new function: whose
  reminder time fell in the last 15 minutes, in their own time zone, and
  who has logged nothing that day.
- **The service worker** gains a push handler that shows the notification,
  and a click handler that opens Today.
- **Settings:** the switch, the time (16:00–04:00), and "Send a test".

### Things that are easy to get wrong

- **Times after midnight.** A reminder at 01:00 is about the evening that
  just ended, not the new day. The day it checks is the one that started
  before the reminder window opened (16:00).
- **Time zones and travel.** The person's zone is stored with the setting
  and updated when the app opens somewhere new (D7).
- **What "no meal yet" means.** Open: no meal at all that day (simplest),
  or nothing since the afternoon (fits 22:30 better). To decide when this
  is picked up.
- **Privacy.** The notification says nothing about health or food ("Time to
  log today"). The text passes through Google's and Apple's push services,
  so the Privacy Policy needs a line about notifications.
- **Off until switched on.** The permission prompt needs a tap anyway, and
  a reminder nobody asked for is the fastest way to be uninstalled.

### Where it works

- **The Android app:** yes. Notifications are already switched on in the
  app package (`enableNotifications`, needed for Play Billing), so it
  should need no new version; to be confirmed on the emulator.
- **Android Chrome, desktop browsers:** yes.
- **iPhone:** only when the site has been added to the Home Screen (iOS 16.4
  and later). A Safari tab cannot receive pushes.

### Testing

The rule of who is due (time, zone, midnight, already logged) as pure
functions with unit tests; the function with a fake push service, like the
other server tests; one real push to the owner's phone before it ships.

Size: about 3–5 days.

## 2. The "sync your watch" reminder

**What the owner asked for:** at the end of the week, if 5 or more days
have no calories burned and a watch is connected, a notification to sync
it.

### What already exists

- A watch connection is a row in `device_tokens` that is not revoked, and
  `last_used_at` says when it last sent anything.
- Days without calories burned can be counted from `observations`
  (`TOTAL_ENERGY`).

So once the daily reminder's machinery exists, this is a second, small job
on the same scheduler: about half a day. Built on its own, it would carry
all of that machinery: about 2 days.

### One problem with the rule as asked

The watch keeps only **the last 7 days** of activity (Connect IQ's
`ActivityMonitor.getHistory()`, measured in Slice 4). By the time 5 days are
missing at the week's end, some of them may already have fallen off the
watch and cannot be recovered. **The recommendation:** check every day, and
remind after **3 days** without a sync, while those days can still be
recovered. To decide when this is picked up.

Also worth knowing: the watch app already syncs by itself every morning in
the background. Several days missing usually means the watch app was
removed, or the phone and the watch stopped talking, so the message should
say how to check both, not only "open the app".

## Order, when picked up

The daily reminder first (it builds the machinery), then the watch
reminder on top of it. Quick-set a day is independent and comes before
both.
