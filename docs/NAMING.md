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

## Correction: the `.io` checks in this document were never real

`rdap.org` answers **404 for every `.io` domain** — `google.io` and `github.io`
included. Every "`.io` available" line in earlier versions of this file was
therefore meaningless, including `healthlog.io`, `precisionhealth.io` and
`mesila.io`. `.io` now goes through `whois.nic.io`, which was verified against
`google.io` (found) and a nonsense domain (not found) before being trusted.

The `.com` and `.app` figures, via RDAP, were and are sound.

---

## The screen, and what it can and cannot see

Rebuilt after **Tavella**, **Kestara**, **Nomari** and **MetricPath** all
turned out to be occupied — by a Google Play developer, a Lithuanian company
with trademark records, a live US/EU filing including class 9, and a marketing
firm respectively. None of those were visible to a domain-and-App-Store check.

| Check | Method | Trustworthy |
| --- | --- | --- |
| `.com`, `.app` | RDAP | yes |
| `.io` | `whois.nic.io` | yes, now |
| iOS App Store | Apple iTunes Search API — app names **and seller names** | yes |
| Live commercial use | does `<name>.com` return 200 | yes, and it is what caught Treliva |
| Google Play, EUIPO, USPTO, Israel | search only | **indicative, not clearance** |

About 50 coined names went through it. What follows is what survived.

---

## Survivors

All of these are clean on: App Store (name and seller), a live `.com` site,
and indexed web/Play/trademark search. **`.com` is taken for every one** —
that is simply four-to-seven-letter `.com` in 2026, and per the brief it is
not disqualifying.

### Tier 1 — `.app` and `.io` both free

| Name | Say it | Notes |
| --- | --- | --- |
| **Velando** | ve-LAN-do | Easiest of the three in both English and Hebrew, and unambiguous to spell from hearing. **But it is a real Spanish/Portuguese word** — "keeping vigil, watching over". Apt, and the same double-edge Mesila had: descriptive in two large markets, so weaker there as a mark. |
| **Ipsara** | ip-SA-ra | Unambiguous to spell. Latin *ipse*, "self". Slightly awkward onset. Also a Greek island, which is minor. |
| **Cendara** | sen-DA-ra | Softest and most brandable. **Fails the spelling test**: heard aloud it is as likely to be written *Sendara*. That is a real cost for a product found by search. |

### Tier 2 — `.io` free, `.app` taken

**Tovena**, **Torena**, **Ferova**, **Norvela**, **Pendara**. All clean on
every other check. Only worth considering if `brand.io` is acceptable.

### Rejected during screening, with reasons worth keeping

| Name | Why |
| --- | --- |
| **Onvara** | **ONVY** — a German AI health-coaching app supporting Garmin, Polar and Apple Watch. Phonetically adjacent, in exactly this category. |
| **Amberis** | The *Amber* root is saturated on Play and the App Store. No direct collision; permanent searchability tax. |
| **Sovena, Corista, Rilana, Palvera, Vestara, Nerova, Talvera, Kalura, Lumara, Modara, Solvera, Diera, Stedra, Tandora** | live site on the `.com` |
| **Tessel, Fathom, Sonder, Cadena, Ostara, Halden, Marlo, Selvan** | every plain word is gone, domains and App Store |
| **Filara, Linara, Cordata, Contena, Mesura, Arcova, Perdura, Selora, Ravela, Ondara, Kenora, Journa** | App Store collision |

---

## What I would take, and what I would not claim

**Velando**, on `velando.app`. It is the only survivor that passes both
pronunciation and spell-from-hearing in English and Hebrew, and its Spanish
sense — watching over — is a better fit for this product than an empty
syllable. The cost is that it is a real word in two large markets, so treat it
as brandable rather than as ownable there.

If that Spanish meaning is unwelcome, **Ipsara** is the cleanest genuinely
empty name and the strongest legally. **Cendara** sounds best and should
probably still be dropped, because a name people mis-spell is one they cannot
find.

**None of this is clearance.** Google Play, EUIPO, USPTO and the Israeli
register have been searched, not cleared, and the pattern of this whole
exercise is that each deeper check has killed names the previous one passed —
HealthLog, Tavella, Kestara, Nomari, Treliva, Chroniva. Assume that continues.
Take the finalist to someone who does clearance for a living **before**
registering anything.

Nothing has been bought and nothing has been renamed.

## What this blocks

`docs/PHASE-1.md` has E3 gating **E4** (the Connect IQ Store listing) and
**E5** (the privacy policy, which must name a legal entity and a contact).
Both are otherwise ready. The privacy policy is drafted and shipping with
`[UNDECIDED: …]` markers exactly where this decision belongs.
