# Compliance — what publishing this actually requires

**Read this first.** What follows is research to make the conversation with a
lawyer shorter and cheaper. It is not legal advice, and some of it is the kind
of detail that changes between when it was written and when you act on it —
particularly the Israeli regime, which was substantially amended recently.
**Do not make a launch decision on the strength of this document alone.**

The useful part is not the law. It is which parts of the law fall on the
architecture, because those are expensive to retrofit and nearly free to build
in now.

---

## What the app actually handles

Being precise about this determines everything else.

| Data | Where it comes from | Sensitivity |
| --- | --- | --- |
| Meals, calories, macronutrients | typed, photographed, described | health |
| Weight, body measurements | typed | health |
| Calories burned, steps, distance | Garmin | health |
| Resting HR, VO₂ max, respiration, stress | Garmin | health |
| Goals and objectives | typed | health-adjacent |
| Email address | sign-up | identifying |
| Meal photographs | camera | **health, and biometric-adjacent if a person appears** |

**All of it is health data**, in the sense every regime below uses. Not
diagnoses or genetics, but nutrition and physiology tied to an identified
person. That is the category that attracts the strictest treatment nearly
everywhere.

### Who else sees it

- **Supabase** — hosts everything. A processor.
- **OpenAI** — receives meal photographs, meal descriptions, and the week
  report. A processor, and the one users will care about most.
- **The host** — serves the app.
- **A payment provider** — will receive billing data (E6).
- **Garmin** — the *source*; data flows from them, not to them.

Every one of these must be named in the privacy policy. "We use third parties"
is not a disclosure.

### One thing already done right

The week report sent to the model **carries no identity** — no name, no email,
no user id, no record ids. There is a test asserting it. That is data
minimisation built in rather than promised, and it is worth keeping as the
standard for anything new that leaves the server.

---

## Israel

**Privacy Protection Law**, substantially amended by **Amendment 13**, in force
since **August 2025**. This is the regime that governs you as the controller,
wherever your users are.

What matters:

- Information about a person's **health condition** is treated as data of
  **special sensitivity**. Nutrition and physiological measurements sit in that
  category.
- Amendment 13 reshaped the database registration regime, strengthened
  enforcement, and introduced administrative penalties with real teeth.
- **Data Protection Officer** and **security officer** obligations attach to
  certain controllers, with thresholds tied to scale and sensitivity.
- **Breach notification** obligations apply.
- Additional governance and notification duties attach above certain database
  sizes.

**Verify the current thresholds with an Israeli privacy lawyer before
launching.** They are the part most likely to have moved, and the part where
being wrong is expensive. A single-user POC is plainly outside all of it; a
paid product with other people's health data is plainly inside some of it, and
the line between is exactly what you need advice on.

**One genuine advantage:** Israel holds an EU **adequacy decision**, so personal
data can move from the EU to Israel without additional transfer machinery. That
materially simplifies serving EU users *from* Israel — but note it says nothing
about data moving onward to the **United States**, which is where OpenAI is.

---

## European Union — GDPR

Applies if you offer the service to people in the EU, whether or not you have
anything there.

Health data is **special category** (Art. 9). Processing is prohibited unless an
exception applies, and for a consumer app the realistic one is **explicit
consent** (Art. 9(2)(a)). Explicit means specific, informed, unambiguous,
separable from the terms, and **recorded** — hence S5.2.

What follows, concretely:

| Obligation | What it means here |
| --- | --- |
| Transparency (Art. 13) | a real privacy policy, before collection |
| Access (Art. 15) & portability (Art. 20) | **export** — S5.3 |
| Erasure (Art. 17) | **delete my account** — S5.4 |
| Records of processing (Art. 30) | a document, not code |
| Processor contracts (Art. 28) | **DPAs with Supabase and OpenAI** |
| DPIA (Art. 35) | likely required — large-scale special-category data |
| EU representative (Art. 27) | likely required if targeting the EU from Israel |
| Security (Art. 32) | encryption, access control, and meaning it |

**Transfers are the sharp edge.** EU → Israel is covered by adequacy. EU →
**United States** is not automatic: sending meal photographs and week reports to
OpenAI is an international transfer needing its own basis — the Data Privacy
Framework, if the recipient participates, or Standard Contractual Clauses.

**This is why S5.5 — data residency — is an architecture decision and not a
detail.** A Supabase region in the EU changes the analysis for every EU user.
Choosing it is free today and painful later.

---

## United States

### HIPAA almost certainly does not apply

The common assumption — health app therefore HIPAA — is wrong. HIPAA binds
**covered entities** (providers, health plans, clearinghouses) and their
**business associates**. An independent consumer app that a person chooses to
use is neither. Health and Human Services has said as much about information
people voluntarily put into consumer health apps.

**That changes** if you ever sell into a clinic, hospital or insurer and process
data on their behalf. Then you are a business associate and the whole regime
lands at once. Worth knowing before that sales conversation, not during it.

### What does apply

- **FTC Health Breach Notification Rule** — reaches health apps *not* covered
  by HIPAA. Improper disclosure of identifiable health information can trigger
  notification duties.
- **FTC Act §5** — a privacy policy that misdescribes what you do is a
  deceptive practice. The policy is an enforceable promise, not marketing.
- **Washington's My Health My Data Act** — broad definition of consumer health
  data, consent requirements, and **a private right of action**, which makes it
  unusually risky for small companies. Frequently missed.
- **California (CCPA/CPRA)**, and a growing list of state privacy laws, several
  treating health data as sensitive with its own opt-outs.

The US is not one jurisdiction; it is a patchwork that keeps growing. **Serving
US users is a decision to take deliberately, not by default** — which is why
"which markets at launch" is a Phase 1 decision.

---

## The AI processor is the part users will ask about

Meal photographs and a week of eating go to OpenAI. That is the disclosure
people notice, and the one most likely to lose trust if it is buried.

- Name OpenAI explicitly, say what is sent and when.
- Get a DPA. Confirm the API terms on training — the default for API data is
  that it is not used for training, but confirm it rather than assume it, and
  restate it accurately in the policy.
- The **"nothing is sent until you ask"** design on the insights card is exactly
  right and should be the pattern everywhere: no health data leaves for the
  model without a deliberate act.
- The audit trail (D13) already records every inference. That is genuinely
  useful evidence of what was sent and when.

---

## Distribution

- **Connect IQ Store** — Garmin puts responsibility for privacy compliance on
  the developer for anything collected through Communications and the health
  APIs, and the submission asks for a privacy policy URL. So **E5 gates E4**.
- **Apple App Store / Google Play** — only relevant if the Apple Watch or
  Samsung routes are ever taken. Both have specific health-data policies,
  stricter than their general ones.

---

## What to do, in order

1. **Decide the markets.** Israel only is dramatically simpler. Adding the EU
   brings explicit consent, DPIA, a representative and transfer analysis;
   adding the US brings a moving patchwork.
2. **Choose data residency** before there is data worth migrating.
3. **Write the privacy policy and terms**, naming every processor.
4. **Build consent, export and deletion** — the three that are code.
5. **Get the DPAs** with Supabase and OpenAI.
6. **Take an hour of Israeli privacy counsel** before charging anyone. One
   conversation, with this document in hand, will settle the thresholds that
   this document deliberately does not assert.

### Where this now stands

Of the six above, **3 and 4 are built.** The policy and terms are drafted from
the code and shipping behind a visible draft banner; consent, export and
deletion all work and are tested. What remains is entirely decisions and
paperwork:

| Still open | Why it is blocking |
| --- | --- |
| Markets | changes whether the EU obligations apply at all |
| Data residency | free now, a migration later |
| Legal entity, address, contact | the policy cannot name a controller without one |
| DPAs with Supabase and OpenAI | signed, not coded |
| Transfer basis for OpenAI | DPF or SCCs — needs checking, then naming in the policy |
| An hour of counsel | before charging anyone |

The `[UNDECIDED: …]` markers in `src/policy/documents.ts` are exactly this
list, and `isDraft()` fails loudly while any of them remain.

**A single-user personal project is outside almost all of this.** It stops being
one the moment a stranger's health data is in the database — which is the same
moment Phase 1 is trying to reach. These become real together.
