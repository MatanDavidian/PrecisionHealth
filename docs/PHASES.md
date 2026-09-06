# The three phases

The owner's plan, with what I would change. **The shape is right**, and one
sentence in it matters more than the rest:

> for the first phase i want a fully works app (even if not with all the
> features)

That is the correct instinct and most of this document is in service of it. A
narrow product a stranger can actually pay for and rely on beats a broad one
that is nobody's yet.

---

## Phase 1 — a product a stranger can use and pay for

**Proposed:** security review · performance and load/stress · payment with
Lemon Squeezy · Garmin watch app · optionally WhatsApp.

### What I would change

**1. The legal entity is the first item, and it is missing.**

Not a formality. It gates the privacy policy's remaining `[UNDECIDED]`
markers, the Connect IQ Store listing, Lemon Squeezy's onboarding, and Meta
Business verification. Four things wait on one registration, and today
everything on this list is technically ready and legally blocked.

**2. Payment goes last, not third.**

You cannot sell a product whose main differentiator — the watch — is not
published yet, and taking money before the security review raises the stakes on
every finding it turns up. Order: entity → security → Garmin published →
payment.

Lemon Squeezy itself is the right call and matches `COMPLIANCE.md`: a merchant
of record absorbs VAT and US sales-tax registration in places you have never
been, which for one person selling from Israel is worth the larger cut.

**3. "Load and stress" is the wrong shape of worry at zero users.**

The app is a static bundle on a CDN, plus Postgres, plus edge functions. None
of that falls over at ten users or a thousand. Load testing now measures an
imagined system.

The real risks at this stage are **cost** and **correctness**, and both are
concrete:

- **A runaway AI bill.** `estimate-food` runs on the owner's OpenAI key. The
  trial ledger caps analyses per user; nothing caps the total, and nothing
  alerts. This is the one that can actually hurt, and it is S5.7.
- **No rate limiting on public endpoints.** `device-sync` accepts a bearer
  token from anything on the internet.
- **One genuine performance issue exists**, and it is not load: **export**
  assembles every record a person has into memory in the browser. Fine at a
  year, unknown at five. Worth a bounded test rather than a load test.

Keep the item; change it to *spend ceiling, alerting, rate limiting, and the
export path*. Real load modelling belongs in Phase 2, when there are users to
model.

**4. WhatsApp should move to Phase 2, not sit in Phase 1 as optional.**

It carries the same entity blocker plus Meta Business verification, which is
calendar time nobody controls. Left in Phase 1 as "optional", it will quietly
eat Phase 1. The spike says the code is hours (`features/whatsapp-intake.md`);
the approval is weeks.

**5. "Garmin watch app" is larger than one line suggests.**

The app works. Publishing it needs the entity, a privacy policy URL,
screenshots, a description, a supported-device list, and Garmin's review. Weeks
of calendar, not days of work — worth its own line so it is not a surprise.

### Also missing from Phase 1

- **Onboarding.** The app assumes you already know what it is. A stranger's
  first thirty seconds are currently undesigned.
- **Error monitoring.** Nothing reports a client-side exception today.
- **Backups.** Supabase takes them; nobody has tested a restore.
- **Support.** `privacy@vimetry.app` now exists and nothing is on the other
  end of it.

---

## Phase 2 — other watches, other stores, more metrics

**Proposed:** Apple Watch and Samsung · App Store and Play · more metrics
(vitamins, more watch metrics), summaries, insights.

### The one thing worth restructuring

**Apple Watch and the iOS App Store are the same project, not two.**

HealthKit is reachable only by a native iOS app holding the entitlement. A
watch app is an extension of that iOS app. So "Apple Watch" *is* "get into the
App Store", and together they are the largest single item in this whole plan —
bigger than all of Phase 1.

Two consequences worth deciding early rather than discovering:

- The app is a React SPA. Shipping it as a store app means a wrapper
  (Capacitor) or a rewrite, and **Apple rejects thin web wrappers** under
  guideline 4.2. A wrapper has to earn its place with real native integration
  — which HealthKit is, so this is achievable, just not free.
- Samsung is a third path again (Wear OS / Health Connect), and should be
  costed separately rather than bundled with Apple.

**Vitamins have a dependency nobody has named.** A photograph does not contain
micronutrient information, and the roadmap already refuses to pretend
otherwise. The credible route is photo → food identity → **database**, which
means licensing a food database or building on USDA plus Israeli food tables.
That is a project, and it should be listed as one.

---

## The admin page

**Partly built already, and Phase 1 needs no screen.**

Migration 0004 ships `admin_daily_cost`, `admin_user_summary` and
`admin_funnel`, answering cost, per-user usage and trial conversion from the
SQL Editor. With a handful of users that is enough, and it obeys **D19** —
an admin sees metering, never anyone's food.

A screen becomes worth building when SQL becomes annoying, which is a real
signal rather than a guess: **Phase 2.** The constraint to keep either way is
D19. The moment an admin page can show a person's meals, a breach of one
account becomes a breach of all of them.

---

## Phase 3 — suggestions, and trainers

**Proposed:** personal suggestions from the user's own data · a page for
trainers and dietitians to follow their clients.

**The trainer feature is the commercially interesting one on this whole list**,
and it is not a feature. It is an architecture change.

Every row in this database is protected by one rule: `auth.uid() = user_id`.
A trainer reading a client's data breaks that rule, and replacing it needs a
sharing model — a grant table, consent from the client, scope (which metrics,
which period), revocation, and an audit trail of who read what and when. That
is the point where the app becomes multi-tenant with delegated access, which is
exactly where health products get breached.

It deserves its own design phase before any code, and probably its own security
review. Two further things to decide before starting:

- **Direction of trust.** Does the client invite the trainer, or the trainer
  the client? Only the first is defensible.
- **Regulatory drift.** Dietitians giving advice *through* the product moves it
  closer to being a health service rather than a logging tool. Worth an hour of
  the same counsel `COMPLIANCE.md` already recommends.

**Personal suggestions** are the natural end of the existing architecture —
append-only history, provenance, conflicts surfaced — and the D13 audit trail
already makes "why did it say that?" answerable. The honest constraint is that
suggestions from a single person's data are weak evidence, and the product's
whole character is not overclaiming. N-of-1 experiments, already in the
roadmap, are the intellectually honest version of this.

---

## The revised order

```
Phase 1   legal entity            ← blocks four things; do it first
          security review
          spend ceiling + rate limiting + export bounds
          onboarding, error monitoring, support
          Garmin published        ← weeks of calendar, start early
          payment (Lemon Squeezy) ← last: nothing to sell until the rest works

Phase 2   WhatsApp                ← moved out of Phase 1
          admin screen            ← when SQL gets annoying
          iOS app + Apple Watch   ← one project, the largest here
          Samsung                 ← costed separately
          food database → vitamins

Phase 3   personal suggestions
          trainers and clients    ← design phase first; it changes the data model
```

Nothing above is a disagreement with the plan's substance. It is three
reorderings — entity first, payment last, WhatsApp out — and two items that are
bigger than one line implies.
