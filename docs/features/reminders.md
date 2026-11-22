# Feature spec — reminders

**One line:** a daily reminder to log meals when nothing is logged by an
hour the person chooses, and a reminder to sync the watch when it has gone
quiet.

Status: **built and live 2026-11-21.** The Privacy Policy gained the two
lines below the same day (version 2026-11-21.2, so everyone signed in was
asked to agree again), and the server side was deployed with
`REMINDERS=1`. The Settings card shows only while the server answers. Epic 6 in
[`../ROADMAP.md`](../ROADMAP.md).

---

## What it does

- **"Remind me to log"**: at a time the person picks, from 16:00 to 04:00
  in quarter hours (default 22:30), a notification, **only if nothing at
  all is logged that day**. A day set in one tap (quick-set) counts as
  logged. Tapping it opens Today.
- **"Remind me to sync my watch"**: when a connected watch has sent nothing
  for **3 days**, at the same time, and then not again for 3 days. Tapping
  it opens Settings → Account, where the watch connection is.
- **Off until switched on.** Turning one on asks this device for permission
  and subscribes it; turning both off stops this device. Other devices keep
  their own subscription, and hear nothing once both are off.
- **"Send a test"**, to see what a reminder looks like.
- **The words say nothing about food or the body:** "Time to log today. Add
  your meals, or set the day in one tap." The text passes through the push
  service and sits on a lock screen. (The meal reminders added on
  2026-11-22 are the exception, by the owner's choice: their button names
  your usual meal. See [`meal-reminders.md`](meal-reminders.md).)
- English and Hebrew; the notification is in the account's language.

### The two decisions (owner, 2026-11-21)

1. **"Nothing logged" means no meal at all that day**, not "nothing since the
   afternoon". Simplest, and someone who logged breakfast and lunch is not
   the person the reminder is for.
2. **The watch reminder comes after 3 days without a sync,** checked daily,
   not after 5 missing days at the week's end: the watch keeps only the last
   7 days of activity, so by the week's end some days could no longer be
   recovered. The message says to open the watch app and check the phone
   and watch are connected, since the watch app already syncs by itself
   each morning and a silence usually means one of those two.

## The rules

In `supabase/functions/_shared/reminderRules.ts`, pure and unit-tested:

- **A reminder belongs to an evening.** At 22:30 it is about that day; at
  01:00 it is about the day before, whose night it is.
- **Due from its time, for two hours.** The schedule runs every 15 minutes;
  if it runs late, the reminder still goes; if it was down all night, nobody
  is woken at seven by yesterday's reminder.
- **In the person's own zone,** stored with the choice and updated when the
  app opens somewhere new.
- **Once.** The database refuses a second claim for the same person, kind
  and day (`claim_reminder`), and for the watch, within 3 days.
- **A deleted meal is not a meal:** a meal whose newest version deletes it
  does not count as logged.

## How it works

```
Settings card ── user_preferences (own row: on/off, time, zone)
      │
      └─ reminders function ── push_subscriptions (one row per device)
            available | key | subscribe | unsubscribe | test

pg_cron, every 15 min ── send-reminders function
      checks the token, reads who has a reminder on, works out who is due,
      claims it (reminder_log), encrypts and sends to each device

service worker ── shows the notification, opens the page on a tap
```

- **Web Push, by hand** (`_shared/webPush.ts`): the message is encrypted to
  each browser (RFC 8291) and signed for the push service (VAPID, RFC 8292)
  with Web Crypto alone. A test decrypts our messages with `http_ece`, the
  reference implementation by the RFC's author, and checks the signature
  with Node's own crypto.
- **Nothing for a person to set up or hold.** The schedule's token is made
  inside the database by the migration, and never seen by anyone. The push
  keys are made by the server the first time they are needed and kept for
  good (a new pair would orphan every subscribed device).
- **Only push services.** A subscription naming any other address is
  refused, so the server can never be pointed at an address of a caller's
  choosing. At most 10 devices per person.
- **Devices that are gone are forgotten:** when a push service answers 404
  or 410 (uninstalled, unsubscribed), the row is deleted.
- **Two new tables, server-only:** `push_subscriptions` and `reminder_log`,
  with row-level security on and no grants to users. The person's own
  choices are new columns on `user_preferences`, under its existing rules.
- **The daily health check** names the schedule if the database could not
  create it ("reminders schedule (cron job send-reminders)"), and the new
  tables and functions like everything else.
- **Account deletion** empties both new tables (cascade, and checked).

## Where it works

- **The Android app and Android Chrome:** yes. Notifications are already
  switched on in the app package, so no new version is needed; to be
  confirmed on a real phone (below).
- **Desktop browsers:** yes.
- **iPhone:** only from the Home Screen (iOS 16.4 and later). In a Safari
  tab the card says how to add it, instead of a switch that cannot work.

## Going live (owner)

1. **Decide the Privacy Policy line** (below). Changing the policy asks
   everyone to agree again, so it may wait for the next change if
   reminders can wait too.
2. **Deploy with reminders:** `REMINDERS=1 ./scripts/deploy-functions.sh`.
   Without `REMINDERS=1` the script leaves the two reminder functions out
   (so other fixes can be deployed meanwhile) and the Settings card stays
   hidden; migration 0018 applies either way, harmlessly. Nothing to type:
   no secret, no key.
3. **Check the schedule exists:** the script's health check at the end
   says so; or Supabase dashboard → Integrations → Cron → `send-reminders`.
4. **One real reminder on your phone:** Settings → Reminders → turn on →
   "Send a test". Then set the time 15 minutes ahead with nothing logged
   that day, and wait for the real one.
5. **Google Play's Data safety form:** add **Device or other IDs** (the
   push address of each device), collected, optional, for app
   functionality. The answers are in `../android/store-listing.md`.

### The Privacy Policy lines (in force from version 2026-11-21.2)

Under "What this app holds about you":

> Reminders, if you turn them on: the time you chose, your time zone, and,
> for each device you turned them on, the address your browser's push
> service gave it.

Under "Who else sees it":

> Your browser's push service (Google's on Android and in Chrome, Apple's
> on iPhone, Mozilla's in Firefox) delivers reminders. It receives the
> device's address and an encrypted message it cannot read, which says only
> that it is time to log.

## Tests

- **Unit** (`src/__tests__/reminderRules.test.ts`, `webPush.test.ts`): the
  time window, after midnight, zones, a late schedule; a deleted meal; the
  watch going quiet, and a second watch still syncing; the words never
  mention food; encryption decrypted by the reference implementation, a
  stranger's keys failing, a fresh salt each time; the VAPID signature
  verified independently; addresses outside the push services refused.
- **Database** (`supabase/test/01_verify.sql`): once a day, three days for
  the watch; the token made in the database; the keys made once and never
  replaced; the time between 16:00 and 04:00; both tables, the keys and the
  private settings out of a user's reach; a person changing their own
  choices.
- **Server** (`supabase/test/reminders.ts`, `send-reminders.ts`): sign-in
  required except for "available"; subscribe, the address check, ten
  devices, a device moving accounts, nobody removing someone else's device;
  the test push encrypted, signed and short-lived; the schedule's token;
  due at the time, not before, not twice; a logged day, a deleted meal,
  after midnight, another zone, switched off, a bad zone; the watch quiet,
  syncing, disconnected; a gone device forgotten.
- **Browser** (`e2e/reminders.spec.ts`, desktop, phone and iPhone): no card
  before the server is deployed; signed out, the card says an account is
  needed; turning it on asks, subscribes and saves (time, zone); a time
  after midnight; a test; both off stops the device; permission refused;
  an iPhone Safari tab told about the Home Screen; the accessibility scan;
  Hebrew. The browser's push machinery is a stand-in there: a headless
  browser has no push service.

## Not in this version

- A different time for the watch reminder than for meals.
- Reminders for signed-out use (they need the server to know whether the
  day was logged).
