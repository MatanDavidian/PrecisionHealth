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

## Result — measured on a Forerunner 265, 2026-09-01

All four questions answered. Full detail in
[`../docs/features/manual-body-and-energy.md`](../docs/features/manual-body-and-energy.md) §4.0.

| | |
| --- | --- |
| `getHistory()` | SUPPORTED, **7 days** (31 Aug back to 25 Aug) |
| `[0]` | **yesterday**, the last completed day |
| `startOfDay` | **local midnight** (`1788123600` = 2026-08-31 00:00 IDT) |
| `History.calories` | **TOTAL** — 2214, matching Connect's Total exactly |

Connect's Active for that day was **131 kcal**. Mapping this field to active
energy would have understated the daily burn by **2083 kcal**.

The original checklist follows, for anyone re-running this on another device.

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

## Running it in the simulator

```sh
./test.sh          # builds with -t, runs the probe, prints what it produced
```

Compiles the `(:test)` functions in and runs them on an fr265 profile, printing
the whole report to the console. That is the only way to read the values from a
script — the simulator's own window cannot be scraped.

**It cannot answer what `History.calories` means.** The simulator's activity
data is invented: every calorie and step comes back 0, and its clock is set
decades ahead. What it does answer, before anything is sideloaded:

- the API surface this build assumes is really there
- `getHistory()` returns 7 entries on an fr265 profile
- no guarded read throws anyway
- `VO2 run`, `VO2 bike`, `rest HR`, `avg rest`, `stress`, `resp` and `recov` all
  return values, which confirms the capability matrix
- consecutive `start:` values differ by exactly 86,400, so the entries really
  are one calendar day apart

### One real bug it caught

`Moment.value()` came back **negative**: `-1875788896`. Monkey C `Number` is
32-bit signed, so any moment past **2038-01-19** wraps — the Y2038 problem, on a
watch. The simulator hit it immediately because its clock is set to 2046;
`-1875788896 + 2³²` is `2419178400`, which is exactly the 2046-08-29 the date
line printed beside it.

A real FR265 in 2026 is nowhere near the cliff, so this changes nothing today.
It is handled anyway: negatives are unwrapped and labelled, so nobody records a
wrapped value by mistake. The formatted date is unaffected — `Gregorian.info`
reads the `Moment` itself, not the wrapped `Number`.

The lesson for ingestion: **the local calendar date is the thing to send**, and
the epoch is a diagnostic beside it. A 32-bit epoch is not a durable key.

## Sending it (the write path)

**It sends when you open it.** No button press in the ordinary case.

Opening the app POSTs to the backend, at most once every **30 minutes**. The
data barely moves — completed days appear once, at midnight — and a watch app is
opened far more often than its contents change, so syncing on every glance would
spend the phone's radio resending what the server already has.

**START forces one anyway**, freshness or not: for a send that failed, or data
you know has just changed. When the app decides not to sync, the bottom line
says when it last did — "synced 12m ago" — so a quiet screen still tells you it
is up to date.

Accumulating metrics — calories, steps, distance — carry **completed days only**.
`getInfo().calories` is a running total, and writing today's would make the week
compare a full day of eating against a partial day of burning.

Point measurements — resting HR, VO₂ max, respiration, stress — carry **today**.
They measure a moment rather than a total in progress, so today's value is
simply today's value, and holding them back would lose a day for nothing.

### One-time setup

1. **Deploy the endpoint** and the migration:
   ```sh
   npx supabase db push
   npx supabase functions deploy device-sync --no-verify-jwt
   ```
   `--no-verify-jwt` matters: the caller is a watch and has no JWT. The function
   does its own auth against `device_tokens`.

2. **Mint a token** (your user id is in Supabase → Authentication → Users):
   ```sh
   node ../scripts/mint-device-token.mjs "My FR265" <user-uuid>
   ```
   It prints the token and the SQL. Run the SQL in the Supabase SQL editor —
   only the **hash** is stored, so a leak of that table yields nothing that
   works. The plaintext is not recoverable; mint a new one if you lose it.

3. **Put it in `garmin/local.env`** (copy `local.env.example`):
   ```
   SYNC_URL=https://<project>.supabase.co/functions/v1/device-sync
   DEVICE_TOKEN=<the value from step 2>
   ```
   Then rebuild — `build.sh` generates `source/BuildConfig.mc` from it. Both
   that file and `local.env` are gitignored, so neither the credential nor a
   copy of it can reach the repository.

   **Why not Garmin Connect's settings page?** Because a sideloaded app does
   not get one. That list is populated from what your Connect IQ *account*
   installed, not from what is on the watch, so an app you copied over USB
   never appears in it and its `Properties` are permanently empty. Properties
   are still read first at runtime, so a future Store build — which does get a
   settings page — needs no change here.

### What the screen says afterwards

| | |
| --- | --- |
| `sent 24 reading(s)` | it worked |
| `synced 12m ago` | recent enough that it did not bother; START forces one |
| `set URL and token in Garmin Connect` | a blank setting, the commonest failure |
| `token rejected` | the token is wrong or revoked |
| `failed (-104)` | no phone connection — Connect IQ's negative codes are transport errors |

### What it sends

```json
{ "zone": "device",
  "observations": [
    { "day": "2026-08-31", "code": "TOTAL_ENERGY", "value": 2214 },
    { "day": "2026-08-31", "code": "STEPS",        "value": 3010 }
  ] }
```

The local calendar date, never the raw epoch — Monkey C Numbers are 32-bit and
wrap in 2038, so the epoch is a diagnostic and not a key.

## What gets sent, and why so little

```
BACKGROUND   completed-day TOTAL_ENERGY, nothing else
FOREGROUND   the full metric set, when you open the app
```

The background service has roughly thirty seconds and a small memory
allowance, so it does one narrow thing. That is a **technical** reason, not a
privacy one — the richer metrics go to your own database in an app built to
hold them, and sending your own resting heart rate to your own health record is
the product rather than an exposure.

The payload carries **only** `{ day, code, value }` and an opaque token. No
name, email, age, weight, GPS, heart-rate samples, Garmin account id or serial.
The server already knows whose token it is. Deleting the account cascades to
both the observations and the device credential, so erasure is structural rather
than promised.

## Before publishing to the Store

**The credential is the blocker, not Garmin's data access.** The token is
compiled into the `.prg`, so today's build works for exactly one watch. Store
apps do get a settings page — the thing sideloading lacks — so the first version
can be "paste a token from the web app", with a pairing code later. `Cfg` reads
`Properties` before the compiled-in value precisely so that change needs no code.

Each installation should keep its own narrow, revocable credential rather than
anything shared with a web session, so a lost watch or a leaked `.prg` is
revoked without touching the account. That is what `device_tokens` already is.

On compliance, briefly, and **confirm it with a lawyer before launch rather than
with a model**: HIPAA generally binds covered entities and their business
associates, not an independent consumer app. The FTC's Health Breach
Notification Rule is the more relevant US instrument. GDPR treats health data as
special category, and Garmin puts that responsibility on the developer. Israel's
Privacy Protection Law treats health information as specially sensitive. None of
that binds a single-user POC; all of it binds a published one.

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
