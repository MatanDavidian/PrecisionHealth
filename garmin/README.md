# Garmin Connect IQ — POC v0

A watch app that **reads and prints. It saves nothing and sends nothing.**

It exists to settle, before any more of the Garmin path is built:

> **What does `ActivityMonitor.History.calories` actually mean**, and how many
> days does the Forerunner 265 really populate?

Garmin documents `getHistory()` as returning `Array<ActivityMonitor.History>` —
at most seven records, **most recent first**, supported on the FR265 since API
level 1.0. So existence is not in doubt; the numbers are. Available history
length varies by device and by how long the watch has been running, and the
meaning of the calorie field is not stated anywhere we can rely on.

The design in [`../docs/features/manual-body-and-energy.md`](../docs/features/manual-body-and-energy.md) §4
rests on both — completed days are written, today is not, and the value maps to
`TOTAL_ENERGY`. The `has` guards stay anyway, because a documented contract and
a watch in your hand are not the same evidence.

There is **no `Communications` permission in the manifest**. Not merely no sync
code: the permission is absent, so this build cannot depend on the phone and
cannot be doing anything but what it says. It gets added in the same commit that
adds sync, and not before.

## What it prints

```
GARMIN DATA POC

getHistory: SUPPORTED
7 day(s) returned

2026-08-29
  kcal:  2381
  steps: 9432
...

TODAY [NOT SAVED]
  kcal:  1744 (part)
  steps: 7218
  recov: 12 h

PROFILE
  VO2 run:  51
  rest HR:  48
```

Up/down pages through it.

Three outcomes are kept apart, because they mean different things:

| Printed | Means |
| --- | --- |
| `getHistory: UNSUPPORTED` | the API is absent — the completed-day design does not work on this watch |
| `getHistory: SUPPORTED` / `history EMPTY (0 days)` | the API is there and returned nothing; probably survivable |
| `getHistory: SUPPORTED` / `N day(s) returned` | the gate is passed |

Every returned day is printed, not just yesterday, so the dates and calorie
figures can be read down the screen against Garmin Connect.

## What to check once it runs

1. **Active or total?** This is the one that matters. At a single moment,
   compare the entry marked `<- newest` against Garmin Connect for that same
   date:

   | | |
   | --- | --- |
   | POC `History.calories` | 2,487 |
   | Connect — Total Calories | ? |
   | Connect — Active Calories | ? |
   | Connect — Resting Calories | ? |

   Matches **Total** → the value maps to `TOTAL_ENERGY` and the plan stands.
   Matches **Active** → it maps to `ACTIVE_ENERGY`, and the plan changes.
   **Do not guess this.** Getting it wrong understates daily burn by roughly a
   BMR and makes every week read as a surplus.

2. **Is the newest entry yesterday, or today?** The date is printed rather than
   assumed. If it is today, the entry is a running total and the "completed days
   only" rule has to skip it.

3. **How many days** come back. Seven is the documented maximum; fewer sets how
   much backfill is possible.

4. **Day boundaries.** Does each printed date match the day Garmin Connect
   attributes those calories to?

## Before this stops being disposable

The application id in `manifest.xml` was invented so the project builds today.
Run **`Monkey C: Regenerate UUID`** from the VS Code command palette once, and
then never change it again.

That id is the application's own identity. It is **not** the Connect IQ Store
identifier — the Store issues a separate public id later, and Garmin's intent
API distinguishes the two as `manifest-id://` and `store-id://`. Changing the
manifest UUID after release makes an installed app and its update look like two
unrelated applications.

## Building it

```
Mac
 ├── VS Code
 ├── the Monkey C extension
 └── the Connect IQ SDK (via the SDK Manager)
```

The extension generates the developer signing key; the watch will not run
unsigned apps.

- `Monkey C: Build for Device` → produces a `.PRG`
- connect the watch over USB, copy the `.PRG` into `GARMIN/APPS/`
- eject, and it appears in the app list

No Connect IQ Store account is needed to sideload onto your own watch, and **no
Garmin Health API approval is needed at all** — that is the whole point of this
route.

## Layout

| File | |
| --- | --- |
| `manifest.xml` | permissions and the device list — deliberately short |
| `source/Probe.mc` | every read, each one guarded; returns lines of text |
| `source/PocView.mc` | paged rendering |
| `source/PocApp.mc`, `PocDelegate.mc` | app entry and up/down |

`Probe.mc` is where the answers come from. Every field is read through a `has`
check, so a metric this watch does not carry prints `--` and the rest of the
report still arrives.
