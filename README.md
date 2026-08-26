# Timeline — AI-Driven Personal Health Platform

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
npm test                 # domain rules, plus the repository contract
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
serve is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

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

## Status

**Slice 1 complete.** You can log a meal and watch today's protein move, and it
survives a reload — data lives in IndexedDB, no account, no server. Confirming
an AI estimate or settling a two-source disagreement writes a real superseding
record, leaving the original readable for audit.

Assumptions and open questions taken along the way:
[`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md).

**Slice 2 built** — photo meal logging
([spec](docs/features/photo-meal-logging.md)). The app opens on a camera:
photograph food, and kcal/protein/carbs/fat come back estimated with per-item
confidence, saved as unconfirmed estimates the Confirm flow settles. Optional
hints (food name, total grams) are treated as ground truth. Runs on your own
OpenAI key, stored on this device only (D14). **Meal photos are never stored** —
sent once, then discarded.

Two steps outstanding: a first run against a live API key (the adapter has
never called the real API), and an HTTPS deploy so it works from a phone.

**Slice 3 done** — accounts and sync, live at
[precisionhealth-9bn.pages.dev](https://precisionhealth-9bn.pages.dev). Sign in
and your data follows you between devices; signed out it stays in the browser
exactly as before. Planned in
[`docs/features/supabase-sync.md`](docs/features/supabase-sync.md); hosting in
[`docs/DEPLOY.md`](docs/DEPLOY.md).

**Slice 3.7 built** — three ways to log, and a meal you can fix
([spec](docs/features/log-modes-and-meal-edits.md)). Log is three modes now:
**Photo** (with an optional note that goes to the model — "no oil", "half
portion"), **Write** (describe a meal in words and get the same estimate,
honestly less certain because nothing was seen), and **Again** (search and
repeat what you have logged before). Every logged meal gained **Edit** and
**Delete**: change the grams and the macros follow by ratio, remove a food,
move it to another slot — or delete it, with Undo. Neither overwrites anything;
an edit is a new meal version, a delete is a version saying it did not happen
(D4, D15).

Next: **slice 4** — importing from Garmin, the first time two sources describe
the same day. See [`docs/ROADMAP.md`](docs/ROADMAP.md).
