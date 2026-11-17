# Roadmap

**The plan from 2026-11-15**, in epics and features. The owner's decision that
day: Phase 1 is finished as a plan. What it still needs to launch is Epic 1;
everything else left over from it waits in the pool
([`BACKLOG.md`](BACKLOG.md)) until it is worth doing, and the work moves on to
what makes the product worth paying for: devices, coaches, and the features
people ask for.

How this page is laid out:
- **An epic** is a goal that takes weeks and can be said in one sentence.
- **A feature** is a piece of it that ships on its own.
- Sizes: **S** under half a day · **M** one to two days · **L** three to five
  · **XL** weeks. Owner: **C** = Claude in the repo · **M** = Matan.
- Status: **now** (in progress) · **next** (the one after) · **later** ·
  **spike** (find out first, then decide).

The history of how the app was built, slice by slice, starts at
"[How it was built](#how-it-was-built-vertical-slices)" below and is kept as
written.

## The epics at a glance

| # | Epic | Why it matters | Status |
| --- | --- | --- | --- |
| 1 | **Launch on Google Play** | Nothing else counts until a stranger can install and pay | now: waiting on testers and Google's 14 days |
| 2 | **AI models and cost** | Half the cost per analysis decides whether US$4.99 is comfortable | now: small |
| 3 | **Watches and scales** | The day should fill itself in, whatever is on the wrist | next: one spike, then build |
| 4 | **Coaches and nutritionists** | The one feature that also brings customers | **set aside by the owner (2026-11-16)**, with the design and mock-ups done |
| 5 | **iPhone app** | Apple Watch, Apple Health, and the App Store are one project | later: the largest item here |
| 6 | **More reasons to open the app** | Reminders, goals, the health scan, WhatsApp | later: pick after the launch |

The recommended order, and the reasoning:

```
Now      Epic 1  testers → 14 days → apply for production      (calendar, not work)
         Epic 2  GPT-6.1 Terra offered, then measured           (days)
         Epic 3  the Garmin app published as it is              (owner, then Garmin's review)

Next     Epic 3  spike: Health Connect inside the Android app   (2 days, decides the epic)
         Epic 4  set aside on 2026-11-16, designed and mocked up
         then build the one the evidence supports first; the recommendation
         is Health Connect, because a coach's view is worth more when the
         client's weight and activity arrive by themselves

Later    Epic 4  coaches, built and piloted
         Epic 5  iPhone app
         Epic 6  one feature at a time, chosen from what users ask for
```

## Epic 1 — Launch on Google Play

**Done means:** the app is in production on Google Play in the countries
chosen, and a stranger has installed it and subscribed.

| Feature | Size | Who | Status |
| --- | --- | --- | --- |
| 1.1 Closed test: 12+ testers opted in for 14 days in a row (4 so far). The invitation and the troubleshooting table are in [`android/closed-test.md`](android/closed-test.md) | calendar | M | now |
| 1.2 Tester feedback: written down as it comes, fixed as it comes | S each | M + C | now |
| 1.3 Money: Google's test deposit confirmed in the payments profile; an accountant asked how VAT and income tax apply to Play sales | S | M | now |
| 1.4 The listing tells the truth: the demo video shows US$8.99 and must go or be re-recorded; the public developer email becomes support@ | S | M | now |
| 1.5 The reviewer's account never runs dry: a permanent free plan for review@ | S | C, with M's approval (it is a change to production data) | next |
| 1.6 Apply for production: Google's questions answered from the notes | S | M + C | after the 14 days |
| 1.6b **A new visitor's first photo:** signed out, the photo is held and the visitor is asked to sign in for the 10 free analyses at that moment, then comes back to it being analysed. Replaces today's dead end ("No API key configured" after the photo). **Built 2026-11-17** ([`features/first-photo.md`](features/first-photo.md)) | S–M | C | done |
| 1.7 The public launch: the Dial logo and icons, a demo video recorded in the Android app | M | M + C | before 1.6 is approved, if wanted; not a blocker |

Built and verified on 2026-11-15: Play Billing end to end (purchase, renewal,
cancellation, expiry), the daily check that the server can still read
purchases, and the first-visit welcome (`ANDROID-APP.md`, `PHASE-1-FINISH.md`).

## Epic 2 — AI models and cost

**Done means:** the app offers the models worth offering, the default is
chosen from measurements, and the price of the plan rests on a measured cost.

| Feature | Size | Who | Status |
| --- | --- | --- | --- |
| 2.1 ~~**Offer GPT-6.1 Terra.**~~ **Done 2026-11-15:** `gpt-6.1-terra` (released 2026-10-26, reported at US$1 / US$5 per million tokens, half of GPT-6.1 Sol) is the third choice in the picker, "Balanced". The owner allowed it in the OpenAI projects; one photo through the production prompt answered in the right shape, in 2.8 s against Sol's 4.5 s, at half the cost. Sol stays the default until 2.2. The daily check probes every key against it | S | M, then C | done |
| 2.2 **Measure the models on real meals:** fifteen real plates through Sol, Terra and Luna (`scripts/eval-models.mjs`, `ops/model-evaluation.md`) | M | M (photos) + C | next |
| 2.3 **Choose the default** from 2.2. If Terra reads plates as well as Sol, the full allowance costs US$1.45–2.65 instead of US$2.90–5.30, against US$4.24 received | S | M | after 2.2 |
| 2.4 **Re-measure the cost per analysis** from the ledger after a few weeks of real use, with Play's 15% in it (`ops/pricing.md`) | S | C | later |

## Epic 3 — Watches and scales

**Done means:** a person with any common watch or smart scale sees their
activity, sleep and weight in Vimetry without typing, on Android first.

There are three ways such data can arrive, and choosing between them is the
whole epic:

1. **An app on the watch itself.** What exists today for Garmin (Connect IQ).
   No approval needed, but it is one app per brand, it reaches only what the
   watch exposes (no sleep, no HRV on Garmin), and each person must install
   it and paste a token.
2. **The phone's health hub.** On Android this is **Health Connect**, a
   store on the phone that Samsung Health, Fitbit, Garmin Connect, Withings,
   Xiaomi and most scale apps write into. On iPhone it is **Apple Health**.
   One integration per platform covers nearly every watch and scale at once.
3. **Each brand's cloud.** Withings, Fitbit, Oura and Polar let a website
   connect directly. Garmin's (the Health API) needs partner approval, and
   applications were closed when last checked (September 2026).

**The recommendation is the second way, starting with Health Connect**,
because the Android app is already on Play and one piece of work reaches
Galaxy Watch, Pixel Watch, Fitbit, most smart scales, and Garmin too
(Garmin Connect writes to Health Connect on Android 14 and later, though
reports say it holds some data back; which data is a question for the spike).

One real obstacle: today's Android app is a Trusted Web Activity, the website
in a full-screen browser with no code of its own, and Health Connect can only
be read by code inside the app. The spike is to add a small native part to
the same Android project that reads Health Connect and sends it to
`device-sync`, the endpoint the watch already uses, without disturbing Play
Billing. If that does not work, the alternative is a different kind of app
shell, which also changes how billing is done: a much larger job, to be
weighed against the iPhone app in Epic 5, which needs that shell anyway.

| Feature | Size | Who | Status |
| --- | --- | --- | --- |
| 3.1 **Publish the Garmin watch app as it is** (`garmin/store-listing.md`): developer account, upload, simulator screenshots, submit | M, then Garmin's review | M + C | now |
| 3.2 **More Garmin models:** today the manifest lists the Forerunner 265 and 265S, proven on hardware. Add the models the simulator proves (Forerunner, Venu, vívoactive, fēnix families) | S–M | C | next |
| 3.3 **Spike: Health Connect inside the Android app.** Two days to answer: can a native part live beside the TWA; which data Garmin, Samsung and a scale really share; what Google's Health Connect declaration asks for | M | C, on the emulator and M's phone | next |
| 3.4 **Health Connect, built:** steps, total and active energy, sleep, resting heart rate, HRV, weight, body fat. They map onto codes the app already stores, and two sources disagreeing about a day is already handled (D6). Needs a Privacy Policy line, the Data safety form, and Google's review of the health permissions | L | C + M | after 3.3 |
| 3.5 **Smart scales:** on Android they come with 3.4 for any scale whose app writes to Health Connect. A direct Withings connection for people who use only the website | M | C | later, on demand |
| 3.6 **Sleep and HRV for Garmin owners:** through 3.4 if Garmin shares them; otherwise ask Garmin again about the Health API | S to find out | C + M | with 3.3 |
| 3.7 **Other clouds** (Fitbit, Oura, Polar, Strava), one at a time | M each | C | later, on demand |

## Epic 4 — Coaches and nutritionists

**Done means:** a client can let their nutritionist or trainer see their
meals, the coach can comment and suggest, and the client can end it at any
moment, with three real coaches using it.

Why it is high on the list: it is the only feature here that brings
customers. One nutritionist with thirty clients is thirty installs that no
advertising bought. Why it is not first: it changes the rule every row in the
database is protected by (`auth.uid() = user_id`), and delegated access is
exactly where health products are breached (`PHASES.md`, Phase 3). So it
starts with design, not code.

**Set aside on 2026-11-16** (the owner's decision), after the design and the
mock-ups were finished. Nothing is built. When it is picked up again, it
starts from the document below; the owner's conversations with coaches
(4.1) are still the first step.

**The design is written (2026-11-16):**
[`features/coaches.md`](features/coaches.md) holds the plan in six slices,
the architecture, the code design, the screens, and nine decisions for the
owner. Its central choice: the rule that protects every health table stays
as it is, and a coach reads through a small set of database functions that
check the grant, cut to its scope, and log the read.

| Feature | Size | Who | Status |
| --- | --- | --- | --- |
| 4.1 **Three conversations:** the owner asks two or three working nutritionists or trainers what they do with clients' food logs today, and what they would pay for | S | M | next |
| 4.2 **Design, on paper:** the client invites the coach, never the reverse; what a coach may see (meals, weight, activity) and for which period; a coach writes comments and suggestions and never edits the client's records; how it ends; who pays. One hour of legal advice on advice given through the app (in Israel "clinical dietitian" is a regulated profession, to be checked) | M | C + M | next |
| 4.3 **The sharing model:** a grants table, row-level rules that let a coach read exactly what was granted and nothing else, a log of who read what, and tests that try to break it | L | C | after 4.2 |
| 4.4 **The client's side:** invite by code, see who has access, revoke in one tap; consent recorded like the policies are | M | C | after 4.3 |
| 4.5 **The coach's side:** a list of clients; a client's day and week, read-only | L | C | after 4.3 |
| 4.6 **Comments and suggestions** on a meal, a day or a week, and the client told about them (in the app first, email after) | L | C | after 4.5 |
| 4.7 **Pilot** with the coaches from 4.1, free, before any price is set | calendar | M | after 4.6 |
| 4.8 **Paying for it:** per coach, per client, or included in the client's plan, decided from the pilot | M | M + C | after 4.7 |

Also needed along the way: the Privacy Policy and Terms (a new version, one
re-consent), Google's Data safety form (sharing at the user's own request is
not "sharing" in Google's sense, to be confirmed against the form), and a
security review before the pilot.

## Epic 5 — iPhone app

**Done means:** Vimetry is in the App Store, reads Apple Health (so Apple
Watch and every scale that writes there), and sells the plan through Apple.

The website already works on iPhones for logging by photo, words and hand.
What an iPhone cannot do from a website is read Apple Health, so this epic is
about the watch and the store, and it is the largest item on this page
(`PHASES.md`, Phase 2): an Apple developer account (US$99 a year), an app
shell around the web app that earns its place with real Apple Health
integration (Apple rejects thin wrappers), Apple's in-app purchase as a third
seller beside Lemon Squeezy and Google Play, and Apple's review.

| Feature | Size | Who | Status |
| --- | --- | --- | --- |
| 5.1 Decide when: after Health Connect has shown what automatic data is worth, or sooner if coaches say their clients are on iPhones | S | M | later |
| 5.2 The shell, Apple Health, the purchase, the listing, the review | XL | C + M | later |

## Epic 6 — More reasons to open the app

Candidates, not commitments. One at a time, chosen from what testers and
first customers ask for.

| Feature | Size | Notes |
| --- | --- | --- |
| 6.0 **Quick-set a day:** less (−15%), average, more (+15%), or a number, in the week view, on the Day tab and in the Nutrition tab (today from 16:00). **Built 2026-11-17** ([`features/quick-set-a-day.md`](features/quick-set-a-day.md)) | S–M | done |
| 6.1 **Reminders:** a daily "log today" reminder at an hour the person chooses (16:00–04:00, default 22:30), and a "sync your watch" reminder when days of calories burned are missing. **Documented for later, 2026-11-17** ([`features/reminders.md`](features/reminders.md)): the app has no notification machinery yet, which is most of the work | M–L | Two open questions are in the document |
| 6.2 **Goals and streaks** (Slice 5 below): targets, adherence, weekly rollups, computed by rules and not by the model | L | |
| 6.3 **Health scan** (Slice 6 below): the week across food, training, recovery and body, every claim linked to its records | L | |
| 6.4 **WhatsApp intake** ([`features/whatsapp-intake.md`](features/whatsapp-intake.md)): send a photo to a number | L, plus Meta's verification | Needs a verified business with Meta |
| 6.5 **Food database and barcodes:** the credible route to vitamins and minerals | XL | Needs a licensed database, or USDA plus Israeli tables |
| 6.6 **Logging offline:** a queue that sends when the connection returns | L | Today a signed-in save fails with a banner (D16) |

## Decisions the plan is waiting for

1. ~~Allow `gpt-6.1-terra` in the three OpenAI projects (Epic 2.1).~~ Done 2026-11-15; the first health check after the deploy confirms each key.
2. **Health Connect or coaches first**, once the spike (3.3) and the
   conversations (4.1) have answered. The recommendation is above.
3. **A registered business.** Coaches paying, Meta's verification, and
   opening the app in the EU and UK (which the non-trader declaration
   forbids, `android/store-listing.md`) all lead to the same registration.
   Worth deciding before Epic 4.8, not after.
4. **Which countries the production release opens in.** Israel only, or more
   outside the EEA and UK.

---

# How it was built: vertical slices

What follows is the roadmap as it was written while the app was built, kept
for its reasoning. It reworks the phase plan in
[`requirements/AI_Driven_Health_App_Product_Roadmap.docx`](requirements/AI_Driven_Health_App_Product_Roadmap.docx).
The product thinking there is kept; the *sequencing* is changed, for one reason
given below.

## The change: vertical slices, not horizontal layers

The original plan is ordered by layer — domain model, then repositories, then
UI, then manual logging, then backend, then integrations, then AI. Each phase
is a complete horizontal band across the system.

That ordering has a specific failure mode: **the first four phases produce
nothing you can use.** Manual logging — the first real feature — arrives at
phase 5, and nothing you log survives until the backend lands at phase 6. So
the model's write path goes unvalidated for four phases, and every mistake in
it is discovered late, when the work already sits on top of it.

This plan slices vertically instead. Each slice cuts through every layer —
model, store, UI — and ends with something you can actually use that evening.
The layered work still happens; it just happens a slice at a time, driven by a
feature that proves it.

The original document's **"What not to build initially"** list survives intact
and is the best page in it.

---

## Slice 0 — Skeleton ✅ done

Domain model, repository interfaces, mock store, Today screen rendering a
seeded day end to end.

**Proves:** the layering works and the seed day renders.
**Ships:** nothing user-facing — this is the only slice that doesn't, which is
why it was kept to days rather than weeks.

## Slice 1 — Log a meal, watch today's protein move ✅ done

Manual meal entry, persisted in the browser (IndexedDB), Today recalculating
from stored data. No accounts, no server, no network. Confirming an AI estimate
and settling a two-source conflict both write real superseding records.

**Proved:** the write path, and it found a bug a read-only mock could not — a
conflict the user had settled kept being raised, because `detectConflict` was
not filtering superseded records. Live in `liveRecords()` now, with a test.
**Ships:** a usable protein tracker.

Assumptions taken along the way are in
[`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) — Q3 has since been settled as D15
(meal versioning, opening slice 3); Q7 (nothing can be deleted) is still open
and worth reading before the cloud slice.

## Slice 2 — Photograph a meal, AI does the numbers ✅ built

Resequenced ahead of auth on a product call (Aug 2026): manual macro entry is
the thing nobody sustains, and the BYOK decision (D14) — the user's own
provider key, stored on-device, calling the provider directly — removes the
server dependency that had this waiting behind the backend.

Camera-first Log screen becomes the app's default view: shutter + one tap to a
saved meal. Optional hints (food name, grams, time) that the model must honour;
everything else estimated — kcal, protein, carbs, fat. Estimates land as
`AI_ESTIMATE` provenance with confidence and an `AIInference` audit row; the
slice-1 Confirm flow settles them. Includes Settings (local key storage), the
first IndexedDB migration, and mobile navigation.

Full plan: [`features/photo-meal-logging.md`](features/photo-meal-logging.md).

**Proved:** the provenance apparatus end to end — `AIInference` logging,
`needsConfirmation`, the supersede chain — and found a second bug the unit
tests could not: the Log screen gated analysis on "is a key set" rather than
"does this estimator need one", which would have blocked slice 3's
server-proxy mode too.
**Ships:** the product's actual differentiator, and the fastest way to log food.

**Since verified against the live API** (real key, real photo — which caught a
prompt that refused groceries and an image-detail setting that starved
portions; both fixed). Outstanding: the HTTPS deploy, which moves into
slice 3.

## Slice 3 — My data, on my devices ← in progress

**Step 0 done:** meal versioning (D15) — meals append a version per edit,
same-version records raise a conflict the user settles. The change that had to
precede sync now has, and the app is better for it regardless of what follows.

Supabase (D16): accounts via email code, each family member's data isolated by
Row-Level Security, online-first. Opens with the D15 meal-versioning fix —
the one change that must precede sync rather than follow it. Append-only
becomes a database grant (INSERT/SELECT only), the same-version conflict
becomes a unique constraint, and first sign-in adopts this browser's real
records while leaving the demo day behind (its fixed ids give it away).
`settings` — and the API key in it — is excluded from sync by design. Includes
the HTTPS deploy that slice 2 left outstanding. The server-side AI proxy stays
out; BYOK continues.

Full plan: [`features/supabase-sync.md`](features/supabase-sync.md).

**Proved:** the seam from D3 under real conditions. The Supabase adapter passed
the same ten behavioural assertions as IndexedDB without a single change —
which is what makes "swapping the store cannot change what a screen sees" a
tested fact rather than a claim. Everything that broke along the way was the
test harness assuming it could clean up after itself, which an append-only
schema forbids.
**Ships:** durable, multi-device data, the first accounts, and the app running
over HTTPS at precisionhealth-9bn.pages.dev — so the camera is finally on the
device that has one.

## Slice 3.5 — AI access: server keys, free trial, paid plans ← next

Inserted ahead of Garmin at the owner's request. Three asks that turn out to
be one feature: a **server-side AI proxy**. A master key in the browser is
extracted in minutes, a client-enforced quota is a suggestion, and a
subscription must be provable — so all three need code the user cannot read.
D14 reserved the space for exactly this; the estimator port means it is one
new adapter, and no screen changes.

Full plan: [`features/ai-access-plans.md`](features/ai-access-plans.md).

**Proves:** that the second estimator mode fits the seam D14 claimed it would.
**Ships:** photo analysis that works the moment you sign in, without anyone
pasting a key.

## Slice 3.6 — Repeat what you usually eat ✅ built

Inserted between AI access and Garmin, on the owner's call: the fastest photo
in the world is still slower than not taking one. Usual meals for the current
slot, single-food chips that combine into a snack, search across everything
ever logged, and a whole-day repeat that places each meal at the time of day it
was eaten — skipping the ones whose hour has not come round yet.

Full plan: [`features/repeat-meals.md`](features/repeat-meals.md).

**Proved:** that the append-only model makes a repeat trivial — a repeat is
just another meal record, so versioning, conflicts and Undo needed no special
case. The provenance rule did need thought: a repeated *confirmed* meal is a
user entry, a repeated *estimate* is still an estimate.
**Ships:** logging a familiar day in one tap, and the end of photographing the
same breakfast every morning.

## Slice 3.7 — Three ways in, and a meal you can fix ✅ built

Two things the app was missing, with one cause: whatever you came to Log to do,
it was below something else, and once a meal was logged it was final.

The Log screen becomes three modes — **Photo** (with an optional note that goes
to the model: "no oil", "half portion"), **Write** (describe it and get the same
estimate), **Again** (search and repeat). Each holds one input and nothing else.
And every logged meal gains Edit and Delete: change the grams and the macros
follow by ratio, remove a food, move it to another slot — or delete it, with
Undo.

Full plan:
[`features/log-modes-and-meal-edits.md`](features/log-modes-and-meal-edits.md).

**Proved:** both seams paid out. Adding a second input to the estimator port
cost one method on three adapters and one branch in the edge function —
validation, entitlement, the ledger and the whole result UI were already
input-agnostic (D14). And editing needed no new storage mechanism at all:
versioning (D15) and item supersession (D4) had been carrying the weight since
before anything used them.
**Ships:** logging the meal you already ate, and fixing the portion the model
got wrong instead of confirming a number you know is off.

## Slice 3.8 — An estimate you can argue with ✅ built

Two requests that turned out to be one idea: the estimate is a starting point,
not a verdict. Its numbers are editable in place before saving — with
re-portioning by ratio and each row showing what the model had said — and the
model may ask one clarifying question whose answer produces a firmer estimate.
A whole conversation about one meal costs one analysis, capped at two
follow-ups.

Full plan: [`features/estimate-conversation.md`](features/estimate-conversation.md).

**Proved:** that D15's editing rule generalises — a corrected item is a user
entry at both moments, before and after saving — and that the append-only
ledger absorbed a second kind of billable event without either trial counter
changing. Found a real React bug the unit tests could not: reading state inside
a `setState` updater and starting work from there, which made answering a
question silently do nothing.
**Ships:** the ability to fix a number while you are looking at it, and a model
that can ask instead of guessing.

## Slice 3.9 — Hebrew, right to left ✅ built

The app speaks English or Hebrew, chosen per device, with the layout mirrored
and the model asked to answer in the same language — so the screen is not
Hebrew everywhere except the food names.

Full plan: [`features/hebrew-and-rtl.md`](features/hebrew-and-rtl.md).

**Proved:** that a typed dictionary derived from English makes an incomplete
translation a build failure rather than a half-translated screen. Found a
settings bug that only a browser could: the store wrote any key but read from a
whitelist, so the choice persisted and came back empty.
**Ships:** an app the owner can read in their own language.

## Slice 3.10 — Numbers you can type ✅ built

Current weight, a target weight, and the calories you spent in a day — enterable
on Today, because the dashboard was showing seeded figures with no way to put
real ones there.

Full plan: [`features/manual-body-and-energy.md`](features/manual-body-and-energy.md).

**Proved:** that the domain modelled in slice 0 was worth modelling. `WEIGHT`,
`ACTIVE_ENERGY`, `Goal` and the precedence rules all already existed; the work
was a write path and somewhere to tap. And it exercised D6 on real input for
the first time — a typed weight joined an existing conflict rather than
overwriting it.
**Ships:** a Today screen that is useful before any device is connected to it.

## Slice 3.11 — A goal with a shape, and a week to judge it by ✅ built

Five objectives rather than a bare target number, and a Day/Week toggle showing
eaten against burned across seven days with a verdict against the objective.

Full plan: [`features/objectives-and-the-week.md`](features/objectives-and-the-week.md).

**Proved:** that refusing to average missing data is worth the extra field. A
day with no burned figure stays undefined rather than zero, the week's target
scales to the days that reported, and the screen says so — otherwise absence
would read as a deficit.
**Ships:** the first answer to "was this week any good?", and the first screen
that grades rather than reports.

## Slice 3.12 — Ask the model about your week ✅ built

Seven days of meals, the totals and the goal, sent on request — and read back as
a summary, what is visible in the data, and what is worth trying. The week
refuses to draw or grade anything until there is a burn figure and an objective.

Full plan: [`features/week-insights.md`](features/week-insights.md).

**Proved:** that a named payload type is worth more than a comment. The promise
on the button — "nothing that says who you are" — is asserted by a test that
serialises a real report and fails on any identity in it.
**Ships:** the first advice the app gives, and the first thing it sends
anywhere on purpose.

## Slice 4 — Import from Garmin ✅ built

Sleep, HRV, resting heart rate, steps, weight. The first time two sources
describe the same day.

**Was blocked, then wasn't (Sep 2026).** Garmin's Health API is still
partner-approval only with applications closed. **Connect IQ turned out to be a
different door entirely** — no approval needed, an app that runs on the watch,
sideloaded over USB. It reads `ActivityMonitor.getHistory()` and posts completed
days to an edge function.

Established on hardware rather than assumed: `History.calories` is **total**
daily energy (2214, matching Garmin Connect exactly, against an active figure of
131 — mapping it to `ACTIVE_ENERGY` would have understated every day by 2,083
kcal). Days anchor at local midnight, seven are available, and `[0]` is
yesterday.

It syncs when the app opens, and once each morning from a background service
without being opened at all. Sleep and HRV remain out of reach — Connect IQ does
not expose them — so the Recovery section still needs a second adapter. See
[`features/manual-body-and-energy.md`](features/manual-body-and-energy.md) §4
and [`../garmin/README.md`](../garmin/README.md).

**Proves:** conflict detection (D6) against real device noise, and whether the
tolerances are tuned anywhere near right.
**Ships:** the Today screen filling itself in without typing.

## Slice 5 — Goals and adherence

Deterministic rule evaluation over stored data. Streaks, targets, weekly
rollups.

**Proves:** D13 — that the engine computes what the AI would otherwise be
tempted to assert.
**Ships:** the reason to open the app daily.

## Slice 6 — Health scan

AI summarises across nutrition, training, recovery and body — every claim
linked to the records it came from, refusing to conclude where data is thin.

**Proves:** AI reading structured data rather than becoming it.
**Ships:** the "See what changed this week" card that is currently a placeholder.

## Phase 1 — a product rather than a tool

Everything above assumes one user, one watch, and a developer on hand.
**[`PHASE-1.md`](PHASE-1.md)** is the plan that stops that being true: repeat a
meal onto another day, cover what exists with tests, a name and a domain,
per-device authentication and the Connect IQ Store, the legal floor, and
payments.

Its companion **[`COMPLIANCE.md`](COMPLIANCE.md)** works out which parts of
Israeli, EU and US law fall on the architecture — the parts that are nearly free
to build now and expensive to retrofit.

The slices below are Phase 2 and beyond. **None of them should start while
Phase 1 is unfinished**, because each one adds surface that Phase 1 would then
have to cover.

> **Superseded 2026-11-15.** The owner closed Phase 1 as a plan: its launch
> items are Epic 1 at the top of this page, the rest wait in
> [`BACKLOG.md`](BACKLOG.md), and the order of what comes next is the epics
> above, not the phases below.

## The three phases

The owner's phase plan, and what I would change about it, is in
[`PHASES.md`](PHASES.md). The short version: the shape is right, and it wants
three reorderings — the legal entity first because it blocks four other things,
payment last because there is nothing to sell until the rest works, and
WhatsApp out of Phase 1 because Meta verification is calendar time nobody
controls.

## Later, in rough order

Structured workout and nutrition plans → plan adherence evaluation → clinical
data (labs, conditions, regimens) → body-photo progression → longitudinal
insights with effect sizes → N-of-1 experiments → proactive agent.

**WhatsApp intake** was parked here waiting for a backend; slice 3 delivered
one, so it is now unblocked and planned in
[`features/whatsapp-intake.md`](features/whatsapp-intake.md). Two findings from
reviewing it are worth having in the roadmap itself: the webhook is a Deno
function and **cannot import a line of `src/`**, so sharing the meal builders
is a prerequisite rather than a detail; and a WhatsApp Business account needs
**Meta Business verification**, which needs the legal entity E3 has not decided
— so the channel cannot open before the name does.

Also parked here: a **food database / barcode path**, which is the credible
route to micronutrients (photo → identity → database), per the slice-2 spec.

Each is a slice on the same pattern. None of them should start before the slice
below it is in daily use.

---

## Working notes

**Definition of done for a slice:** it works E2E for a real day of your own
data, the domain rules it touches have tests, and it is deployed somewhere you
can reach from your phone. A slice that only works on localhost isn't finished.

**Keep from the original document, unchanged:** data first and AI second;
normalise external data into one internal model; separate raw from derived;
keep provenance everywhere; controlled AI tool access rather than database
access; structured plans over prose; correlation is not causation; ask the user
where uncertainty is material.

**On the agent team idea** (PM, engineer, QA, customer success, cost advisor):
that is a *delivery-process* investment, not product architecture, and it pays
off in proportion to how much product there is to manage. Worth revisiting once
a slice is shipping regularly and there is CI to hang it on. Building it before
there is a product to run it against would be the same mistake as the watch app.

**On changing technology later:** D2 and D3 exist precisely so that this is
affordable. The domain layer is portable, the store is behind an interface, and
the UI is the only part genuinely coupled to React. If the mobile app becomes
the main surface, the rewrite is one layer, not one system.
