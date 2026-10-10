# Connect IQ Store: publishing the watch app

Drafts and steps for "Publish the Garmin app" (`docs/PHASE-1-FINISH.md`),
written 2026-10-10. The owner submits; review takes calendar time nobody
controls, so start early.

## Ready in the repository

- **Name:** the watch app is now called **Vimetry** (it was still "Garmin
  Data POC").
- **Store build:** `garmin/build.sh --store` produces `garmin/bin/Vimetry.iq`.
  It holds **no device token** (the build refuses if one appears), and the
  public production sync address, so a user only enters their own token.
  The sideload configuration (`local.env`) is put back afterwards.
- **App id:** made permanent on 2026-09-06 (`manifest.xml`). It must never
  change again.
- **Devices:** Forerunner 265 and 265S. The 265 is proven on hardware, the
  265S in the simulator. Widening the list is a manifest edit and a rebuild,
  and each new watch should be checked in the simulator.
- **Icon:** the orange dot, 60×60, matching the app's stand-in mark. Replace
  it with the logo later.

## What the app does (for the description and Garmin's review)

- **Reads:** completed days of activity from the watch's own history (up to
  seven days back), plus today's readings:

  | When | Readings |
  | --- | --- |
  | Completed days | total calories burned, steps, distance |
  | Today | stress, respiration rate, resting heart rate, VO₂ max (running) |

  It does **not** read sleep, location or heart-rate streams.
- **Sends:** those numbers, through the phone, to the person's own Vimetry
  account, authenticated by a device token they created in Vimetry. It
  sends nothing else, to nobody else.
- **When:**
  - when the app is opened (START to sync)
  - once a day in the background, around 07:30 local time
- **Permissions:**

  | Permission | Why |
  | --- | --- |
  | Background | the morning sync |
  | Communications | sending through the phone |
  | UserProfile | VO₂ max and resting heart rate live there; refused, they show a dash |

## Listing text

**Name:** Vimetry

**Description:**

```
Vimetry puts what you eat beside how much you move. This watch app sends your Garmin's daily numbers to your Vimetry account, where they sit next to your meals: calories burned against calories eaten, day by day and across the week.

What it sends, once a day and when you open it:
• Completed days: total calories burned, steps, distance
• Today: stress, respiration rate, resting heart rate, VO₂ max

Only to your own Vimetry account, and only those numbers. No location, no sleep, no heart-rate streams.

SETTING IT UP
1. On vimetry.app (or the Android app), sign in and open Settings → Account & data → Watches and devices. Create a token and copy it — it is shown once.
2. In the Garmin Connect app on your phone: Devices → your watch → Activities & Apps → Vimetry → Settings. Paste the token into "Vimetry device token". Leave "Server address" empty.
3. On the watch, open Vimetry and press START. It says "synced just now" when it has worked.

A token can only add readings to your account; it cannot read anything. Revoke it from the same Settings page at any time.

Vimetry is not a medical device. Privacy policy: https://vimetry.app/privacy
```

**Category:** Health & Fitness. **Support:** support@vimetry.app.
**Privacy policy:** https://vimetry.app/privacy.

## Steps for the owner

1. **Connect IQ developer account:** apps.garmin.com/developer. Sign in with
   the Garmin account and accept the developer agreement. It uses the same
   legal identity as Lemon Squeezy and Google Play.
2. **Build the package:** `cd garmin && ./build.sh --store`.
3. **Upload:** Developer dashboard → **Upload an app** → `garmin/bin/Vimetry.iq`.
   Fill in the listing above, the icon, and the screenshots (next step).
4. **Screenshots:** from the Connect IQ simulator (`./test.sh` starts it on
   the fr265), showing the main screen after a sync. Garmin wants a
   screenshot of the app on a device frame. The simulator's "Save
   screenshot" does that.
5. **Submit for review.** Garmin emails when it is approved or if anything
   needs changing.
6. **After approval:** the Store issues its own public id, separate from the
   manifest id. Put the Store link on vimetry.app's Devices section, where
   people create their token. That is a small C change once the link exists.

**Important:** the sideloaded copy on your own watch has the same app id, so
installing from the Store replaces it. The device token you pasted is then
set again through Garmin Connect (step 2 of "Setting it up"). The compiled-in
fallback was only for sideloading.
