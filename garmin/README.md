# Garmin Connect IQ — POC v0

A watch app that **reads and prints. It saves nothing and sends nothing.**

It exists to answer one question before any more of the Garmin path is built:

> Does the Forerunner 265 return **completed previous days** through
> `ActivityMonitor.getHistory()`?

The design in [`../docs/features/manual-body-and-energy.md`](../docs/features/manual-body-and-energy.md) §4
rests on that — completed days are written, today is not — and Connect IQ gates
APIs per device, so it is checked with `has` rather than assumed.

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

1. **`getHistory` supported, and non-empty.** This is the gate. Everything else
   is secondary.
2. **Active or total?** At one moment, compare the newest history entry against
   Garmin Connect for that day: Total Calories, Active Calories, Resting
   Calories. If it matches Total → the value maps to `TOTAL_ENERGY`. If it
   matches Active → it maps to `ACTIVE_ENERGY`, and the plan changes. **Do not
   guess this**; getting it wrong understates daily burn by roughly a BMR and
   makes every week read as a surplus.
3. **Day boundaries.** Does the printed date match the day Garmin Connect
   attributes those calories to?
4. **How many days** come back — this sets how much backfill is possible.

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
