# Feature spec — Slice 3: accounts and a real backend (Supabase)

**One line:** your data stops living in one browser — sign in, and every
device sees the same health log, with each family member's data isolated by
the database itself.

Status: **complete** (Aug 2026). All seven steps built and verified; the app is
live at [precisionhealth-9bn.pages.dev](https://precisionhealth-9bn.pages.dev).
Decisions here implement D15 and D16 (see ARCHITECTURE.md).

---

## 1. What this slice must fix

Today everything lives in IndexedDB in one browser profile. Concretely:

- "Clear browsing data" erases the health log. No backup, no undo.
- The phone and the laptop cannot see the same data — and the phone is the
  camera.
- There are no accounts, so "family and friends" cannot use it at all.

Slice 2's HTTPS deploy is still outstanding and lands here too — sync to a
server you can only reach from localhost would be pointless.

## 2. Scope

**In:** Supabase project (Postgres + auth), meal versioning (D15), a Supabase
repository adapter behind the existing interfaces, email sign-in, first-login
adoption of this browser's data, append-only enforced by the database, the
storage-target setting wired to reality, HTTPS deploy.

**Out (explicitly):**
- **Offline support.** Online-first by decision (D16). The append-only model
  keeps the door open: an offline queue later *replays appends* rather than
  merging edits. Until then, no connection → reads fail visibly, writes show
  the existing failure banner.
- **Sharing between accounts.** "Family" means each person has their own
  private data. Seeing each other's dashboards is a product feature with real
  consent questions — later, deliberately.
- **Realtime push.** Two devices converge on next read; live cross-device
  updates are a later nicety (Supabase Realtime slots in without schema
  changes).
- **Server-side AI proxy.** The key stays BYOK (D14). The proxy becomes
  worthwhile once there are users who should not manage keys — not this slice.
- **Photos.** Still never stored (Q10) — nothing changes.

## 3. Step 0 — meal versioning (D15), before any sync exists ✅ done

*(Findings 2-4 from the architecture review — the session module, the config
leak, and silent write failures — are already fixed. This is the remaining
prerequisite.)*

The domain change:

```ts
interface Meal {
  // ...as today, plus:
  /** Starts at 1; every edit appends a NEW record with version + 1. */
  version: number
}
```

- **Write rule:** nothing ever updates a meal row. Confirming an item, fixing
  a weight, changing a slot — each produces a complete new meal record, same
  `mealId`, `version + 1`. (`supersedes` chains inside items keep working
  unchanged; the version is about the aggregate.)
- **Read rule:** `latestVersion(meals)` in the domain returns the
  highest-version record per `mealId`; every reader uses it.
- **Conflict rule:** two records with the same `(mealId, version)` and
  different content = two devices edited the same base. Reuse the D6 pattern:
  show both, the user picks, the choice is written as `version + 1`
  superseding both. One `MealConflictNotice` component, same shape as the
  existing `ConflictNotice`.
- **IndexedDB migration (v3):** existing meal rows become `version: 1`; the
  row key changes from `id` to `id + version` (or a composite), additive
  otherwise.

Local-only, fully testable before Supabase enters: same-version collisions can
be fabricated in tests exactly as the weight conflict is today.

**Built (Aug 2026).** `src/domain/mealVersions.ts` holds the three rules
(`latestVersions`, `detectMealConflicts`, `nextVersion` / `resolveMealConflict`);
`MealConflictNotice` mirrors the observation conflict card.

One design change against the plan above: **the IndexedDB v3 migration is
additive and rewrites nothing.** The store's key path was already `id`, so
versioned rows simply put their `recordId` there — no rekeying needed. Rows
written before v3 carry no `version`, and are normalised on READ (`asMeal`:
missing version means version 1, and its record id is its meal id, which is
exactly true since it was the only version). A migration that rewrites every
meal is the one that can lose meals; a tolerant read cannot. The first attempt
did try the read-drop-recreate dance and silently failed to stamp rows —
`getAll()` returns a promise under `idb`, so the request callback never fired.
That is the argument for the additive route, not just a preference.

Verified in a browser: confirming an AI estimate appended version 2 and left
version 1 on disk; a fabricated second-device write at the same version raised
the conflict card with both choices; resolving wrote version 3, which wins,
with all four records still present.

## 4. The backend shape

### Schema — hybrid, not fully relational yet

One table per store, each row carrying the domain object as `jsonb` plus the
columns that need indexing or constraining:

| Table | Indexed columns beyond `id` | Notes |
|---|---|---|
| `meals` | `user_id`, `day`, `meal_id`, `version` | **`unique (meal_id, version)`** — see below |
| `observations` | `user_id`, `day`, `code` | mirrors the IDB indexes |
| `sleep`, `workouts`, `goals` | `user_id`, `day` | |
| `inferences` | `user_id`, `day` | the AI audit trail syncs too |
| `profiles` | `user_id` | |
| `clinical` tables | `user_id`, `day` | created now, unused until that slice |

The `data jsonb` column holds the domain object exactly as the client built it
— the same envelope philosophy as the IDB rows, so objects round-trip
unchanged. **Why not full columns now:** the analytics phases will want them,
but Postgres can add generated columns and views over `jsonb` incrementally,
per metric, when a query actually needs them. Normalising everything up front
would freeze the domain model at its least-proven moment.

**Not synced, ever:** the `settings` store. The API key stays on-device (D14,
Q8) — this exclusion is why settings was a separate store from day one.

### The database enforces the architecture ✅ built (step 1)

*Migrations live in `supabase/migrations/`; `npm run db:verify` proves every
rule below against a throwaway Postgres in seconds.*

Two properties move from convention into the database itself:

- **Append-only (D4):** authenticated users get `INSERT` and `SELECT` only.
  No `UPDATE`, no `DELETE`, enforced by grants — a bug in any client
  *cannot* rewrite history.
- **Same-version conflict (D15):** `unique (meal_id, version)` means the
  second device writing version 3 gets a constraint violation, not silent
  success. The client catches exactly that error, refetches both records, and
  raises the conflict UI. The database is the conflict detector; no
  clocks, no merge daemon.
- **Isolation:** Row-Level Security on every table:
  `user_id = auth.uid()` for both read and write. Family members cannot see
  each other's rows even if a client is buggy or hostile.

### Auth — magic links, no passwords

Supabase email OTP ("we sent you a six-digit code") — the right shape for
family users who will not manage passwords. `session.ts` was built for this:
`getSession()` starts returning the Supabase session; `UserId` becomes the
Supabase UUID. Screens don't change — that was the point of fixing finding 2
first.

### First sign-in: adopting this browser's data

The one-time bridge from local to cloud. On first login with local data
present, offer: *"This browser holds N days of logged data — move it into your
account?"*

- **The demo data problem (Q5) resolves itself here:** seeded records have
  fixed, human-readable ids (`meal-breakfast`, `obs-hrv`…) while every real
  record has a UUID from `crypto.randomUUID()`. Adoption uploads **only
  UUID-keyed records** — the sample day stays behind, and the account starts
  with exactly what the user actually logged.
- Records upload with `user_id` rewritten from the local placeholder to the
  authenticated UUID. Idempotent: re-running skips ids already present, so an
  interrupted adoption resumes safely.
- After adoption, IndexedDB is retired from the read path (the adapter swap in
  the composition root — one line, per D3).

### What the composition root looks like after

```
signed out → IndexedDB adapter (exactly today's behaviour, still works)
signed in  → Supabase adapter (all reads/writes to Postgres, RLS-scoped)
```

The storage-target card in Settings stops being aspirational: "My own server"
disappears as a separate option (Supabase *is* the server option), the card
shows sign-in state, and "This browser" remains what signed-out means.

## 5. Failure behaviour (online-first, said honestly)

| Situation | Behaviour |
|---|---|
| Write fails (network, RLS, constraint) | The existing failure banner — built for this — names it, offers retry. Nothing pretends to have saved. |
| Same-version constraint violation | Not an error: triggers the meal-conflict flow. |
| Read fails | Screen shows a plain "can't reach your data" state with retry — new, small. |
| Signed out mid-session | Back to the sign-in screen; local adapter untouched. |
| No connection at all | The app says so. It does not half-work. |

## 6. Testing

- **Contract tests:** the existing repository test suite (writes, corrections,
  candidates, day bucketing) becomes adapter-parameterised — the same
  assertions run against IndexedDB always, and against a local Supabase
  (Supabase CLI / Docker) when present, env-gated so CI without Docker still
  passes.
- **D15 unit tests:** `latestVersion`, version increment on every edit path,
  fabricated same-version collision → conflict raised → resolution writes
  version+1 superseding both.
- **RLS test:** two test users; each inserts, each reads; assert user B sees
  zero of user A's rows *through the API itself*, not through app code.
- **Adoption test:** local store with seed + real records → adopt → cloud
  holds only the real ones; run twice → no duplicates.
- **Manual E2E:** sign in on laptop and phone, log a meal on the phone,
  see it on the laptop; edit the same meal on both while one is stale →
  conflict appears, resolves, both devices converge.

## 7. Acceptance

- Sign in on two devices; a meal logged on one appears on the other after
  refresh.
- Clearing browser data and signing back in loses nothing.
- A second family member's account sees none of yours (verified by test, not
  by trust).
- Editing the same meal on two stale devices produces the conflict card, and
  resolving it converges both.
- The demo day never reaches the cloud.
- App deployed over HTTPS, usable from the phone — closing slice 2's last gap.
- All existing tests stay green; every new rule above has one.

## 8. Build order (each step leaves the app working)

1. ✅ **D15 meal versioning** — domain + IDB v3 migration + conflict UI + tests.
   Ships alone; the app is better even if Supabase never arrives.
2. ✅ **Schema, RLS and grants** — `supabase/migrations/`, verified by
   `npm run db:verify` against real Postgres (append-only refuses UPDATE and
   DELETE; a duplicate `(meal_id, version)` is refused, which IS the conflict
   signal; one user cannot read or write another's rows). Creating the cloud
   project and pasting the two migrations is the user's step —
   `supabase/README.md` has it. The adapter *contract* test rig moves to step 3,
   where the adapter it tests exists.
3. ✅ **Supabase repository adapter** (reads + writes), unwired — plus the
   contract rig: one behavioural suite in `src/data/__tests__/contract.ts`, run
   against IndexedDB always and against a real project when a test account is
   configured. Ten assertions asking what a screen asks (round-trip, day
   filtering, inclusive ranges, every meal version kept, candidates left
   unresolved, `latest()` scoped to the newest day, empty days, audit payload
   intact, same-version writes surfaced rather than silently replacing).
4. ✅ **Auth screens + `session.ts` becomes real + composition root switches on
   sign-in.** Emailed sign-in; the adapter swap is the one-line change D3
   promised. supabase-js loads dynamically, so the initial bundle is smaller
   than before the slice began.
5. ✅ **First-login adoption flow** — offers to move this browser's records
   into a new account, judging by id: generated UUIDs are yours, the seed's
   fixed ids are not, so the sample day never reaches the cloud (Q5). Copies
   rather than moves, and is safe to re-run.
6. ✅ **Settings storage card reflects reality; read-failure states.** A failed
   read used to leave the screen on "Loading…" forever — survivable when reads
   were local, a lie once they cross a network. It now says it cannot reach the
   data, shows why, and offers to retry, keeping whatever was already on screen
   rather than blanking it.
7. ✅ **HTTPS deploy** at precisionhealth-9bn.pages.dev, verified end to end.

## 9. Risks, named

- **The jsonb schema defers analytics work** — accepted deliberately; views
  and generated columns are additive when phase 13 arrives.
- **Meal-level versioning produces false conflicts** when two devices edit
  different items of one meal (D15's recorded tradeoff). Low frequency
  expected; revisit if it fires in family use.
- **Supabase free tier pauses inactive projects** — fine for active use; the
  data survives pausing, but first request after a pause is slow. Say so in
  the UI if it bites.
- **Adoption is the one irreversible-feeling step** — mitigated by being
  idempotent, additive, and leaving the local store untouched.
