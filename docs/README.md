# Docs

Where everything about Vimetry is written down. Start with the plan; each
folder below holds one kind of document.

## The plan

- [`ROADMAP.md`](ROADMAP.md): the six epics, what is done and what is next.
- [`BACKLOG.md`](BACKLOG.md): the pool of smaller things, not yet scheduled.

## Folders

| Folder | What is in it |
| --- | --- |
| [`features/`](features/) | One spec per feature: why, what it does, how it is built, its status. |
| [`features/mockups/`](features/mockups/) | The designs drawn before building: every screen as an image, the canvas source, and the link to the interactive canvas. |
| [`engineering/`](engineering/) | How the system is built and kept healthy: [architecture](engineering/architecture.md), [deploying](engineering/deploy.md), [security](engineering/security.md), [performance and load](engineering/performance.md), and the [open questions](engineering/open-questions.md) the code links back to. |
| [`ops/`](ops/) | Running it as a business: payments, pricing, compliance, the model evaluation, operations setup. |
| [`android/`](android/) | The Google Play app: the [plan](android/plan.md), the closed test, the store listing. |
| [`garmin/`](garmin/) | The watch app's store listing. |
| [`design/`](design/) | Briefs for the design tool and the link to the app's design canvas. |
| [`history/`](history/) | Closed plans, kept as the record of what was decided and why: the three phases, Phase 1 and how it was finished, the naming research, the first requirements. Read for context; the plan is the roadmap. |

## Conventions

- **A new feature** gets `features/<name>.md`, with a status line at the top
  ("designed", "built 2026-11-17"), and its mock-ups in
  `features/mockups/<name>/`. The roadmap row links to the spec.
- **A plan that closes** moves to `history/`, with a line at its top saying
  when and where its open items went.
- **File names** are lowercase with hyphens. Only `README.md`, `ROADMAP.md`
  and `BACKLOG.md` are capitals, so the plan stands out at the top.
