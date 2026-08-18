# Timeline — AI-Driven Personal Health Platform

A longitudinal personal health platform: nutrition, training, recovery, body
measurements, wearable data and clinical information in one timeline — with AI
layered on top of a structured model rather than replacing it.

Built from [`docs/requirements/AI_Driven_Health_App_Product_Roadmap.docx`](docs/requirements/AI_Driven_Health_App_Product_Roadmap.docx).
UI direction comes from the Timeline mockups in Claude Design (link in
[`docs/design/claude_design.txt`](docs/design/claude_design.txt)).

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run typecheck
```

Node 20+.

## Architecture

The roadmap's core principle drives the folder layout:

```
data sources → normalized health model → analytics/goal engine → AI tools → UI
```

| Path | Role |
|---|---|
| `src/domain/` | **Phase 1.** Entities, units, time semantics and provenance. No framework imports — this layer is portable to any client. |
| `src/data/repositories.ts` | **Phase 2.** Repository interfaces the UI depends on. Async by design so a REST implementation drops in unchanged. |
| `src/data/mock/` | In-memory store + seed dataset (the 18 Aug sample day). Replaced by the API in phase 6. |
| `src/data/analytics.ts` | Derived values (daily totals). Kept apart from stored records — computed numbers never overwrite measurements. |
| `src/ui/` | Screens and components. Reaches data only through the repository interfaces. |

### Two rules worth keeping

1. **Provenance is not optional.** Every record carries `source`, `kind`
   (`RAW` / `USER_CONFIRMED` / `DERIVED`) and, for AI values, `confidence`.
   A Garmin reading, a manual entry and an unconfirmed AI estimate are
   different kinds of evidence and the UI shows them differently.
2. **Units are explicit.** Values are `Quantity<Unit>`, never bare numbers.

## Status

Phase 1–3 skeleton. Today screen renders the seed day end to end; the other
screens are stubs labelled with the roadmap phase that fills them in.

Next: finish the domain model (labs, conditions, medications, experiments are
sketched but not exercised), then manual logging, then the backend.
