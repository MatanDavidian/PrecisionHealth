# E3 — the name, and the address

**Status: research and options. The decision is yours; nothing here has been acted on.**

The code side is already done and does not depend on the answer: the product
name now lives in [`src/brand.ts`](../src/brand.ts) and nowhere else, and
`vite.config.ts` fills the `<title>` from it. **Renaming is one edit.**

---

## The problem as it stands

The app says **Timeline** on screen. The repository says **PrecisionHealth**.
Two names for one product is the state a rename starts from, and both have a
problem beyond that:

- **Timeline** is a common noun in the software vocabulary — Facebook,
  Twitter, project tools, video editors. It is effectively unregisterable as a
  trademark for software and it is unsearchable. Someone who hears the name at
  the gym cannot find the app.
- **PrecisionHealth** is a category term. "Precision health" is an entire
  field, with conferences and journals and existing companies. Same problem,
  plus it sounds like a clinic.

Both are *descriptive*, which is exactly the category trademark law protects
least. That matters more than it sounds: without a defensible name you cannot
stop a competitor using it, and an app store can be made to take your listing
down on someone else's word.

---

## The lesson from HealthLog

`healthlog.io` was free, and **HealthLog was still the wrong answer** — there
is an active self-hosted personal health tracker by that name, with wearable
integrations, timelines and AI insights, plus several Play Store apps. The
domain being available told us nothing.

That was a bad check, so the method changed. **Domain availability is the last
filter, not the first.** A name has to survive product collision before it is
worth pricing.

Two more from the same round, found the same way: **HealthTrace** is an AI
health journal, **HealthLens** is heavily occupied, and **Vitaloop** is almost
exactly this product's pitch already.

The conclusion is structural: **descriptive two-word names in this category are
saturated.** Health/Vital/Life/Bio × Log/Path/Signal/Trace/Lens/Loop is a grid
that has been filled in.

---

## What I actually checked

| Check | How | Reliable? |
| --- | --- | --- |
| `.com` / `.app` | RDAP — the registries' own API | yes |
| iOS App Store | Apple's public iTunes Search API | yes |
| Web / product collision | search | **partial** — this is what missed HealthLog |
| Google Play | — | **not checked**, no public API |
| Garmin Connect IQ | — | **not checked** |
| Trademark registers | spot checks only | **not checked properly** |

Checked 2026-09-04. The last three are yours to do, and the trademark one
should be done by someone who does it for a living.

---

## Ruled out — occupied

These are dead. Not "crowded": there is a named product in the way.

| Name | What is already there |
| --- | --- |
| **HealthLog** | self-hosted health tracker, same category (your finding) |
| **HealthLoop** | *HealthLoop: Nutrition & Gym* — this exact app |
| **HealthOrbit** | *HealthOrbit Ai* |
| **VitalPath** | *VitalPath* and *Vital Path: Watch Readiness* |
| **VitalStory** | AI health-log product with "AI-Guided Health Logs" |
| **HealthSignal** | *dIAgnoser Health Signal* |
| **Traceline** | *Traceline: Health Tracker* |
| **HealthTrace**, **HealthLens**, **Vitaloop** | your findings |
| **Reckon**, **Cairn**, **Daybook**, **Waypoint** | every single English word is gone, domains and App Store |
| **Continua**, **Chronon**, **Wayline**, **Steadwell**, **Aveline**, **Tessara**, **Everso**, **Velmora** | occupied on the App Store |
| **LifeMetric**, **BodySignals**, **Perenna**, **Selfward** | clear on the App Store, but `.com` and `.app` both taken |

---

## Survived screening

Clear on the App Store, `.app` free, nothing obvious on the web. **None has
been through Play, Connect IQ, or a proper trademark search.**

### Descriptive — findable, but weak to defend

| Name | Notes |
| --- | --- |
| **MetricPath** | nothing found anywhere. Reads slightly corporate/analytics. |
| **WellSignal** | nothing found. "Well" leans wellness-industry. |
| **BioTimeline** | nothing found. "Bio-" leans laboratory. |
| **VitalHistory** | nothing found. "History" is honest for an append-only record; also the most clinical-sounding here. |
| **LifeSignals** | clear on the App Store, but **check this one first** — I believe there is a medical-device biosensor company by this name. |
| **Vitalign** | clear on the App Store, but there is a live USPTO mark (VDF FutureCeuticals) for a supplement ingredient. Adjacent enough to matter. |

### Coined — ownable, and you pay for it in marketing

| Name | Notes |
| --- | --- |
| **Nomari** | zero hits anywhere. `.app` free. |
| **Kestara** | zero hits. `.app` free. |
| **Tavella** | zero hits. `.app` free. Reads Italian, pronounces itself. |
| **Ardenna** | zero App Store hits, `.app` taken. |

`.com` is taken for every single one of these. That is simply the state of
four-to-six-letter `.com` in 2026 and should not, by itself, kill a name.

---

## Decision: VitalTimeline

Reached after a second, better screen that ruled out **HealthThread**,
**VitalThread**, **HealthTrail**, **VitaLoom**, **WellTrace**, **VitalScope**,
**HealthArc**, **HealthCanvas**, **VitalFrame**, **VitalLedger**, **VitaChron**
and **HealthTimeline** — all of them occupied, several by products describing
almost exactly this roadmap. `WellThread` is a Levi Strauss mark.

### Verified

| Check | Result |
| --- | --- |
| `vitaltimeline.com` | **free** |
| `vitaltimeline.app` | **free** |
| iOS App Store | nothing |
| Indexed web presence | nothing under this exact name |

`.com` being free for an exact-match, readable, two-word name is genuinely
unusual and is the strongest single argument for it. Owning the exact-match
`.com` is the best available defence against confusion in a crowded space.
`vitatimeline.com` and `welltimeline.com` are also free, as fallbacks.

### The one piece of luck worth recording

**Vital (tryvital.io) — a wearable-health-data API covering Garmin, Oura,
Whoop and Apple Health — has rebranded to Junction.** That was the single most
dangerous "Vital" collision imaginable for this product, and it is vacating the
name.

### The highest remaining risk

**`vital.io` is a hospital care-experience platform, and it ships a feature
called "Today's Care Timeline."** A company called Vital with a product feature
called Timeline is the closest thing to a real conflict found, and it is
exactly what opposing counsel would point at. Different segment — inpatient
hospital experience, not personal health tracking — so probably survivable, but
**take this specific one to the trademark search.**

---

## One correction to the reasoning behind it

The screening concluded that `Health + noun` is saturated and `Vital + noun`
has more room. **The evidence gathered says otherwise.** The elimination list
contains eight Vital/Vita collisions — VitalThread, VitalPath, VitalScope,
VitalFrame, VitalChronicle, VitalLedger, VitaChron, VitaLoom — which is more
than the Health ones.

The honest reading is that **`Vital + noun` is equally crowded, and
VitalTimeline is an unclaimed square on the same board rather than a move to an
emptier board.**

That does not change the decision. It changes what to expect:

- A neighbour will arrive. Plan on sharing the shelf eventually.
- The name is descriptive, so it is **findable but weak to defend**. That is a
  legitimate trade — clarity now against defensibility later — but it should be
  made knowingly.
- The **`.com`** and a distinctive wordmark are the real assets here, not the
  words. Get both.

---

## Why it is still the right pick

- It names the actual architecture. This is not an app that logs health; it is
  a longitudinal record from which trends, goals, correlations and insights are
  derived. The append-only model (D4), meal versioning (D15) and surfaced
  conflicts (D6) all exist to make one honest timeline. The name says that.
- **The AI is something acting on the timeline, not the brand.** That is the
  right relationship, and it is what stops the name dating — the estimator will
  be replaced, and the name will not have to be.
- It survives the roadmap: clinical data, lab panels, Apple Watch, Samsung,
  agents, experiments. None of those need a rename.
- It does not sound like a hospital, an insurer, a diagnostic tool, or a
  bodybuilding app.

## Presentation

```
VitalTimeline
Your health, connected over time.
```

- **App Store / Play:** `VitalTimeline: Health Tracker`
- **Garmin Connect IQ:** `VitalTimeline` — 13 characters. **Check how this
  renders on a 260px watch face before committing to it**; Connect IQ listings
  are read on the device.

---

## Do these now, in this order

1. **Register `vitaltimeline.com` today.** It is free, it has now been written
   down, and availability is volatile. This is the cheapest irreversible step
   and the one that stops being available first.
2. **Trademark search** — class 9 (software) and class 44 (health services), at
   the Israeli
   [Patent Office](https://www.gov.il/en/departments/israel_patent_office),
   EUIPO and USPTO. **Raise `vital.io` and its "Care Timeline" feature
   explicitly.** This one is worth paying a professional for; it is the check a
   free domain most misleads you about.
3. **Google Play and Garmin Connect IQ** — neither has a public API and neither
   has been checked here.
4. **Then** rename: one edit to `src/brand.ts`, plus `package.json` and the
   repository. And get `privacy@vitaltimeline.com` before the privacy policy is
   published — it has to name a contact.

## What this blocks

`docs/PHASE-1.md` has E3 gating **E4** (the Connect IQ Store listing) and
**E5** (the privacy policy, which must name a legal entity and a contact).
Both are otherwise ready. The privacy policy is drafted and shipping with
`[UNDECIDED: …]` markers exactly where this decision belongs.
