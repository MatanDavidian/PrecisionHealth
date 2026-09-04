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

## What I actually checked

Availability by RDAP — the registries' own API, so these are real answers.
Checked 2026-09-04; **re-check before buying.**

### The ones you named

| Domain | Status |
| --- | --- |
| `precisionhealth.com` | taken |
| `precisionhealth.app` | taken |
| `precisionhealth.io` | **available** |
| `aiprecisionhealth.com` | taken |
| `precisionhealthinsights.com` | **available** |
| `aitimelineforhealth.com` | **available** |
| `healthtimeline.app` | **available** |

### The HealthLog family

Added after `HealthLogAIInsights` was proposed. **The short form is free, and
it is the best name in this whole document.**

| Domain | Status |
| --- | --- |
| `healthlog.io` | **available** |
| `healthlog.health` | **available** |
| `healthlog.app` | taken |
| `healthlog.com` | taken |
| `healthlogai.com` | **available** |
| `healthlogai.app` | **available** |
| `healthloginsights.com` | **available** |
| `healthlogaiinsights.com` | **available** |

### Others in the same spirit

| Domain | Status |
| --- | --- |
| `plateline.app` | **available** |
| `precisionlog.app` | **available** |
| `tallyhealth.app` | **available** |
| `caliper.*`, `tally.health`, `datum.health`, `vernier.health`, `truelog.app`, `clearplate.app` | taken |

---

## Two things in those names that will cost you

Said once, plainly, because you asked for suggestions and this is the useful
part of the answer.

### "AI" in the name dates the product

It is 2026 and every health app has a model in it. Putting **AI** in the name
now reads the way **e-** read in 2001 and **Cyber** read in 1998: it stamps the
year it was built onto the thing forever. It also names the *mechanism* rather
than what the user gets — and the mechanism will change. When the estimator is
something else in three years, the name is still advertising a component.

Look at what the products in this exact category are called: **Whoop, Oura,
Levels, Zoe, Cronometer, MacroFactor, Lose It.** All of them use AI heavily.
None of them say so in the name.

### Stacking category words makes a name less distinctive, not more

*Precision*, *Health*, *Timeline* and *Insights* are four category words. Every
competitor may use all four — which is exactly why adding them cannot make you
easier to find. `AIPrecisionHealthInsights` is 25 characters. Practical limits:

- iOS and Play cap the name at 30 characters and truncate to roughly 12–15
  under the icon in search results.
- A Garmin Connect IQ listing shows on a **watch face**.
- Nobody can say it aloud in one breath or type it from memory.

Descriptive names are also the category trademark law protects least. You could
not stop a competitor using `PrecisionHealthInsights`, and someone with a prior
mark could have your Store listing pulled.

---

---

## HealthLog

`HealthLogAIInsights` contains a good name and three words weighing it down.
Take them off and you get **HealthLog** — nine characters, says precisely what
the app is for, and someone can hear it once and type it correctly. That is the
whole test a name has to pass.

It also drops the two weakest words rather than the strongest: *AI* names a
component that will be replaced, and *Insights* is a generic SaaS suffix that
adds five characters and no meaning. What is left — **log your health** — is
the actual promise, and it is the one thing in the phrase a competitor cannot
make more true of themselves than of you.

`healthlog.io` is free. So is `healthlog.health`, though that one reads
clinical, which this app deliberately is not.

The honest cost is the same as Route 1 below: it is descriptive, so it is weak
as a trademark and the search results are crowded. It is not *unusable* the way
`Timeline` is — "health log" is a phrase, not a platform feature named by
Facebook — but you would not be able to stop anyone else using it.

---

## Three routes, and what each one costs

### 1. Keep it plain — **Precision Health**, on `precisionhealth.io`

Available, matches the repository, zero rename friction, and says exactly what
it is. The honest cost: unregisterable, several existing companies use the
phrase, and search is crowded — someone who hears it at the gym will not find
you.

**Right if** this stays a personal or small paid product and you would rather
spend the effort on the app.

### 2. Fuse the same words into one — the **MacroFactor** pattern

Take your ideas and make them one coined word instead of four stacked ones.
`precisionlog.app` and `plateline.app` are both free. *Plateline* in particular
carries this app's actual idea: the plate, and the continuous line of them.

**Right if** you want something defensible without inventing a word nobody can
place. This is the pattern most of the category uses.

### 3. Short and arbitrary — the **Whoop / Oura** pattern

Strongest trademark, and the most expensive: nobody guesses what it does, so
every impression has to teach it. Only worth it with a marketing budget.

---

## My recommendation

**HealthLog, on `healthlog.io`.**

It is the shortest, clearest thing that has come out of this — it survives
truncation on a phone and on a watch face, it can be said aloud, and it is
drawn from your own vocabulary rather than mine. `precisionhealth.io` is the
runner-up and is also free, but "precision health" is a research field before
it is a product, and it sounds like a clinic.

Either way, treat the name as a decision you can revisit once there are users
rather than one to spend another week on. `src/brand.ts` makes changing it one
edit.

**Do not ship as `Timeline`.** That one is genuinely unusable — a common noun
in software, unsearchable, and already claimed as a term by much larger
products.

Whatever you pick:

1. **Search the trademark registers first** — Israeli
   [Patent Office](https://www.gov.il/en/departments/israel_patent_office),
   EUIPO, USPTO — in class 9 (software) and class 44 (health services). A free
   domain is not a free name.
2. **Get an address on it** (`hello@`, `privacy@`) before the privacy policy is
   published. It has to name a contact, and a gmail address there undercuts
   everything the document says about taking custody of health data.

---

## What this blocks

`docs/PHASE-1.md` has E3 gating **E4** (the Connect IQ Store listing) and
**E5** (the privacy policy, which must name a legal entity and a contact).
Both are otherwise ready. The privacy policy is drafted and shipping with
`[UNDECIDED: …]` markers exactly where this decision belongs.
