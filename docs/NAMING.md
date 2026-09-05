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

## Correction: the `.io` checks in earlier versions were never real

`rdap.org` answers **404 for every `.io` domain** — `google.io` and `github.io`
included — so every "`.io` available" line this file once carried was
meaningless, `healthlog.io` and `precisionhealth.io` among them. `.io` now goes
through `whois.nic.io`, verified against a known-registered domain and a
nonsense one before being trusted. `.com` and `.app`, via RDAP, were always
sound.

---

## Current candidates

A full screen of `Health + noun` and `My Health + noun` rejected almost all of
it on exact product collisions — Health Journal, Health Story, Health Ledger,
Health Compass, Health Diary, Health Companion, Health Record, Health Track,
Health View, Health Trends, Health Dashboard, My Health Story, My Health
Journal, My Health Journey and more all have live products on the exact name.
Two survived, and both are clean on every check available here.

| Name | `.com` | `.app` | `.io` | App Store |
| --- | --- | --- | --- | --- |
| **Health Daybook** | **free** | **free** | **free** | nothing |
| **My Health Chronicle** | **free** | **free** | **free** | nothing |
| Health Chronicle | taken | free | taken | nothing |
| Health Recordbook | taken | free | free | nothing |
| Personal Health Book | **live site** | free | free | nothing |

All three domains free for the top two is unusual and is the strongest
practical argument for either.

### Health Daybook

```
Health Daybook
Your personal health, day by day.
```

A daybook is literally a chronological daily record, which is what the
append-only model (D4) makes the app. Fourteen characters, fits a watch face,
spells itself. "Daybook" is less familiar than "diary" to non-native speakers —
the cost of it being unoccupied.

### My Health Chronicle

```
My Health Chronicle
Track your health. Understand your patterns.
```

Describes the whole eventual product rather than daily logging — wearables,
labs, body progress, patterns, experiments. Nineteen characters, which is long
for a Connect IQ listing; check how it renders on a watch before committing.

### The standing caveat

Both are **descriptive**, so findable and weak to defend, and neither has been
cleared. Every deeper check in this exercise has killed names the previous one
passed — HealthLog, Tavella, Kestara, Nomari, Treliva, Chroniva. Before buying
or renaming: USPTO, EUIPO, the Israeli register, Garmin Connect IQ, and an
exact Google Play search. That is now a small job, with two names in it.

Nothing has been bought and nothing has been renamed. `src/brand.ts` makes the
rename one edit whenever the answer arrives.

---

## Rejected earlier, kept because the reasons still apply

- **Coined names** — Tavella, Kestara, Nomari, Treliva, Chroniva all turned out
  occupied by Play developers, trademark filings or live sites. Velando, Ipsara
  and Cendara survived a fifty-name screen if a coined direction is ever
  revisited.
- **VitalTimeline** — `.com` and `.app` free, but `vital.io` is a hospital
  platform shipping a "Today's Care Timeline" feature.
- **HealthLog** — an active self-hosted health tracker of the same name.
- **Timeline**, **PrecisionHealth** — descriptive and undefendable; the two the
  app and the repository currently use.

## What this blocks

`docs/PHASE-1.md` has E3 gating **E4** (the Connect IQ Store listing) and
**E5** (the privacy policy, which must name a legal entity and a contact).
Both are otherwise ready. The privacy policy is drafted and shipping with
`[UNDECIDED: …]` markers exactly where this decision belongs.
