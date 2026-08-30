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

[0] <- newest
  date:  2026-08-29
  start: 1787950800
  kcal:  2381
  steps: 9432

[1]
  date:  2026-08-28
  start: 1787864400
  kcal:  2554
  steps: 11208
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

4. **Where the day is anchored.** Take the printed `start:` epoch and convert
   it, then see what wall clock it lands on **in your own zone**:

   | Lands on | Means |
   | --- | --- |
   | `00:00` local | anchored to local midnight — what we assume |
   | `03:00` local on a UTC+3 watch | anchored to **UTC** midnight |
   | anything else | a device-defined boundary we have to model explicitly |

   The formatted `date:` above it cannot tell these apart, because it is derived
   through `Gregorian.info`, which applies the local zone either way. This
   decides which local calendar day a `TOTAL_ENERGY` observation belongs to, and
   getting it wrong shifts a whole day's burn onto its neighbour.

5. **Day boundaries against Connect.** Does each printed date match the day
   Garmin Connect attributes those calories to?

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

**One-time setup.** A free Garmin account is needed to download, but **no
Connect IQ Store account and no Health API approval** — that is the whole point
of this route.

1. **Java.** The compiler is a Java program. `java -version` should print 8 or
   newer; a JDK 17 is fine.
2. **Connect IQ SDK Manager** — from `developer.garmin.com/connect-iq/sdk/`.
   Run it and install the current SDK.
3. **In the SDK Manager's Devices tab, download `Forerunner 265`.** The SDK on
   its own cannot build for a device whose definition is not installed. This is
   the step people miss; the symptom is an "unknown product" error naming
   `fr265`.
4. **VS Code extension**: *Monkey C*, published by Garmin.
5. **Developer key**: Command Palette → `Monkey C: Generate a Developer Key`.
   A watch will not run an unsigned app. It normally lands at
   `~/.Garmin/developer_key` — it is a **private key**, and `.gitignore` is set
   up to keep it out of this repo.

**Compiling.** Either:

```sh
./build.sh              # fr265 by default
./build.sh fr265s
```

or in VS Code — open **this `garmin/` folder** as the workspace root, not the
repository root, or the extension will not find `monkey.jungle`. Then
`Monkey C: Build for Device`.

Prefer `build.sh` for a first build: it prints the whole compiler output in one
place, which is what to paste when something fails.

**Running it.**

- *Simulator* — `Monkey C: Run App` (F5). Good for "does it compile and render".
  **Its activity data is fabricated, so it cannot answer the calories question.**
- *Watch* — connect the FR265 over USB and copy the `.prg` into `GARMIN/APPS/`,
  then eject. If the watch does not appear in Finder it is presenting as MTP
  rather than as a disk; *Android File Transfer* handles that on macOS.

## Known-good toolchain

First clean build was against:

| | |
| --- | --- |
| SDK | `connectiq-sdk-mac-9.2.0-2026-06-09` |
| Device definitions | Forerunner 265 / 265s (API level 5.2) |
| Java | OpenJDK 17 |
| macOS | 15.1, Apple Silicon |

Builds with **no warnings**. If a warning appears, it is new — read it.

Three things the first build caught, in case they come back:

- **XML comments cannot contain `--`.** The manifest is rejected outright, with
  an error that does not mention which comment.
- **`me` is Monkey C's reference to the current instance**, so it cannot be used
  as a variable name.
- **The launcher icon must match the device's size** — 60×60 for the FR265, not
  the 40×40 that is common elsewhere. This one is only a warning; the image is
  scaled if it is wrong.

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

Members are read **by name**, never by indexing the object with a symbol.
Symbol indexing compiles but the compiler cannot verify it, and since every
figure in the report passes through one helper, a runtime failure there would
produce a blank screen and no clue why. Naming them makes the compiler do the
checking.
