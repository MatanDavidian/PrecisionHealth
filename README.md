# Vimetry — a personal health log

A longitudinal personal health platform: nutrition, training, recovery, body
measurements, wearable data and clinical information in one timeline — with AI
layered on top of a structured model rather than replacing it.

Built from [`docs/requirements/AI_Driven_Health_App_Product_Roadmap.docx`](docs/requirements/AI_Driven_Health_App_Product_Roadmap.docx).
UI direction comes from the Timeline mockups in Claude Design (links in
[`docs/design/claude_design.txt`](docs/design/claude_design.txt)); what the app
actually looks like today is
[`docs/design/current-ui-brief.md`](docs/design/current-ui-brief.md).

## Getting started

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # unit tests: domain rules, data, plan rules
npm run test:e2e         # the browser suite (Playwright, phone and desktop)
npm run test:functions   # every Supabase function, against fakes
npm run build            # typecheck + production build
npm run supabase:check   # confirm .env.local reaches your project
npm run db:verify        # prove the schema enforces its invariants
```

Copy [`.env.example`](.env.example) to `.env.local` for Supabase; without it
the app runs local-only. Backend setup is in
[`supabase/README.md`](supabase/README.md), hosting in
[`docs/DEPLOY.md`](docs/DEPLOY.md).

Node 20+.

## High-level decisions

Full reasoning in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the plan they
serve is in [`docs/ROADMAP.md`](docs/ROADMAP.md). What finishes Phase 1 is in
[`docs/PHASE-1-FINISH.md`](docs/PHASE-1-FINISH.md); the Android app and Google
Play Billing in [`docs/ANDROID-APP.md`](docs/ANDROID-APP.md).

| # | Decision | In short |
|---|---|---|
| D1 | React + TypeScript on the web | The watch needs Connect IQ regardless, so Flutter's one-codebase promise never applied. Mobile-native is deferred, not foreclosed. |
| D2 | The domain layer imports no framework | It is the asset that outlives every technology choice. |
| D3 | Screens depend on repository interfaces | Makes the store — and later the whole backend — a swappable adapter. |
| D4 | Records are append-only | A correction is a new record superseding the old, so AI writes are reversible and history survives. |
| D5 | `USER_CONFIRMED > device > AI_ESTIMATE` | One pure resolver, shared by client and future server. |
| D6 | Disagreements are shown, not resolved silently | Two sources past tolerance become a question, and the answer is the best signal in the system. |
| D7 | UTC instants **plus** the record's IANA zone | UTC answers "when"; the zone is what answers "which day", stably, after travel and across DST. |
| D8 | One canonical unit per dimension, branded | g / cm / kcal / s. The compiler rejects an unconverted value; conventions erode, types don't. |
| D9 | Infrastructure chosen late, in three steps | Local → managed Postgres → server-side AI. Slice 1 ships without a backend. |
| D10 | `Observation` is the spine | Every scalar fact is one type; only aggregates (Meal, Workout, Sleep) get their own. |
| D11 | Medications and supplements are one type | Same structure; intent (`Regimen`) stays separate from fact (`IntakeEvent`) so adherence is answerable. |
| D12 | Experiments modelled now, built much later | The only feature that constrains the whole model — cheaper to satisfy now than to migrate to. |
| D13 | Deterministic before intelligent | AI proposes and explains; the rule engine computes. |
| D14 | AI on the user's own key, from the device | BYOK: key stored locally, sent only to the provider. What lets photo logging ship before the backend exists. |
| D15 | Aggregates are versioned, not rewritten | Meals append a new version per edit; same-version records are a conflict the user settles. Restores D4's sync-safety for meals. |
| D16 | Supabase, online-first, accounts from day one | Real Postgres keeps the analytics roadmap open and the schema portable; offline sync is a later addition the append-only model makes tractable. |

## Structure

```
data sources → normalized health model → analytics/goal engine → AI tools → UI
```

| Path | Role |
|---|---|
| `src/domain/` | Entities, units, time, provenance and conflict resolution. No framework imports. |
| `src/domain/__tests__/` | The rules that must not silently regress: day identity, precedence, units. |
| `src/data/repositories.ts` | Interfaces the UI depends on. Async by design. |
| `src/data/index.ts` | Composition root — the one place the active store is named. |
| `src/data/idb/` | IndexedDB store (slice 1, v2 in slice 2). Swapped in without touching a screen. |
| `src/ai/` | The food-estimate port (photo *and* text), validator, OpenAI adapter and a fake. Photos stay in memory. |
| `src/data/mock/seed.ts` | The sample day, built for whatever date you open it on. |
| `src/data/analytics.ts` | Derived values, never written back onto records. |
| `src/domain/mealEdits.ts` | Correcting a logged meal: re-portion by ratio, supersede, remove. |
| `src/ui/` | Screens and components; reaches data only through repositories. |

## Status (2026-10-11)

**Live at [vimetry.app](https://vimetry.app).** Phase 1 is nearly done; what
is left, and in what order, is in
[`docs/PHASE-1-FINISH.md`](docs/PHASE-1-FINISH.md).

- **Logging:** photo, words, manual entry, "Again" (repeat a past meal), adjust
  an estimate, fill a missed day from your average. Estimates come from
  GPT-6.1 Sol or GPT-6 Luna, with per-item confidence; nothing is ever
  overwritten (D4, D15). Meal photos are never stored.
- **Views:** Today, Nutrition, and the week (eaten against burned).
- **Accounts:** optional. Signed out, everything stays in the browser.
  Signed in, it syncs (Supabase, EU). Consent, export and account deletion
  are all in the app.
- **Garmin:** a Connect IQ watch app sends daily activity. It is ready for
  the Store (`docs/garmin/store-listing.md`).
- **Paying for analysis:**
  - 10 free analyses on our key
  - a subscription (Lemon Squeezy, test mode until the owner goes live:
    `docs/ops/payments.md`)
  - or your own OpenAI key
- **Installable:** add it to the Home Screen. It opens offline.
- **Android:** a Play Store app with Google Play Billing is built and
  waiting on Google's account checks (`docs/ANDROID-APP.md`).
- **In English and Hebrew.**
- **Operations:**
  - deploys go only through CI
  - one script deploys the functions (`scripts/deploy-functions.sh`)
  - a daily health check emails on failure
  - browser errors are reported (`docs/ops/`)

How it got here, slice by slice: [`docs/ROADMAP.md`](docs/ROADMAP.md).
Assumptions and open questions: [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md).
