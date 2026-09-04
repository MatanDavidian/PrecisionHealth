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

## What I would actually do

**Pick a coined name.** The screening above is the argument: every descriptive
combination worth having is either taken or one search away from being taken,
and you have now been bitten by that twice. A coined name is the only kind you
can own, and your own framing already solves its weakness —

```
Tavella
Track nutrition, training, recovery and health
```

The subtitle does the explaining, is free to change, and can be keyword-tuned
for the stores. The name only has to be sayable, spellable, and yours.

Of the four, **Tavella** and **Kestara** are the easiest to say and spell in
both English and Hebrew, and neither sounds like a clinic or a device.
**Nomari** is the cleanest legally — literally nothing found — and the flattest.

If you would rather stay descriptive, **MetricPath** is the strongest survivor,
and you should expect to share the name eventually.

### Before you commit, whichever you pick

1. **Google Play** and **Garmin Connect IQ** — I could not check either.
2. **A real trademark search** in class 9 (software) and class 44 (health
   services), at the Israeli
   [Patent Office](https://www.gov.il/en/departments/israel_patent_office),
   EUIPO and USPTO. This is the check that a free domain most misleads you
   about, and it is worth paying for.
3. **Say it out loud to five people and ask them to spell it.** Cheapest test
   there is.
4. **Then** buy the domain, and get `privacy@` on it before the privacy policy
   is published — the policy has to name a contact.

---

## What this blocks

`docs/PHASE-1.md` has E3 gating **E4** (the Connect IQ Store listing) and
**E5** (the privacy policy, which must name a legal entity and a contact).
Both are otherwise ready. The privacy policy is drafted and shipping with
`[UNDECIDED: …]` markers exactly where this decision belongs.
