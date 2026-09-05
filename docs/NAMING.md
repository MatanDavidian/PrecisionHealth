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

## Decided: Lifemetry

`-metry` is the process of measuring — telemetry, optometry, biometry — so the
name carries a meaning rather than an explanation attached afterwards, and
"life" keeps the scientific ending warm. Broad enough for meals, sleep,
training, body, labs and whatever follows, without naming a feature.

```
Lifemetry
Understand your patterns over time
```

The tagline deliberately says *understand* rather than *measure*. The name
already carries measurement; the product's actual promise is the pattern.

### Verified

| Check | Result |
| --- | --- |
| `lifemetry.app` | **free** |
| `lifemetry.io` | **free** |
| `lifemetry.com` | registered 2021 — **but the nameservers are `DNS-EXPIRED.COM`** |
| iOS App Store | nothing |
| `github.com/lifemetry` | **free** |
| `instagram.com/lifemetry` | **taken** |

### Two things to act on

**`lifemetry.com` looks like it is expiring.** It sits on GoDaddy's
expired-domain nameservers behind Domains By Proxy. That means it is somewhere
in the renewal-grace/redemption cycle and **may drop**. A backorder or
drop-catch is cheap and is the only way to get it; once it drops it will be
taken within seconds by a catcher. Worth doing now — this is the single
time-sensitive item in the whole naming exercise.

**Instagram `@lifemetry` is taken** — the motivational account already found.
Different class of use, not a product collision, but it does mean the obvious
handle is gone. Settle on the handle before printing anything.

### The reservation worth keeping

Real `-metry` words are built on Greek combining forms that end in a linking
vowel: **ge-o-metry, tel-e-metry, bi-o-metry, opt-o-metry**. That vowel is what
makes the stress land and the word sound native. "Life" is an English word
ending in a consonant, so *Lifemetry* is a hybrid that breaks the pattern —
which is exactly why its stress is ambiguous and why the hear-and-spell test is
worth actually running.

Not disqualifying. *Television* is the same kind of hybrid (Greek *tele* +
Latin *visio*), was criticised for it, and is now universal. But it predicts
the failure mode: people will hesitate on first hearing and stress it
differently from one another. **Say it to five people, ask them to spell it and
say it back.** Spelling matters more than stress — a product has to teach its
own pronunciation anyway, but a name people cannot spell is one they cannot
find.

### Still outstanding

The trademark search — USPTO, EUIPO, Israeli register, classes 9 and 44 — plus
Google Play and Garmin Connect IQ. **Nothing here is clearance**, and every
deeper check in this exercise has killed a name the previous one passed.

### Also considered

`Ownpattern` screened cleanest of all — `.com`, `.app` and `.io` **all free**,
nothing on the App Store — and says the thing this product uniquely becomes.
It is the fallback if the trademark search goes badly. `Sensearc`, `Ownsense`
and `Selfknown` all have live sites on the `.com`.

---

## Rejected, kept because the reasons still apply

- **Health Daybook / My Health Chronicle** — both clean, both descriptive.
  Superseded by wanting a name that can be owned.
- **Coined names** — Tavella, Kestara, Nomari, Treliva, Chroniva all occupied
  by Play developers, trademark filings or live sites.
- **VitalTimeline** — `.com` and `.app` free, but `vital.io` is a hospital
  platform shipping a "Today's Care Timeline" feature.
- **HealthLog** — an active self-hosted health tracker of the same name.
- **Timeline**, **PrecisionHealth** — the two the app and repository used until
  now; descriptive and undefendable.

## What this blocks

`docs/PHASE-1.md` has E3 gating **E4** (the Connect IQ Store listing) and
**E5** (the privacy policy, which must name a legal entity and a contact).
Both are otherwise ready. The privacy policy is drafted and shipping with
`[UNDECIDED: …]` markers exactly where this decision belongs.
