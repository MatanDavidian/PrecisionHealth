# Feature spec — Photo meal logging (slice 2)

**One line:** open the app, photograph your food, one tap later it's logged —
kcal, protein, carbs and fat estimated by AI on the user's own API key, saved
as an unconfirmed estimate the existing Confirm flow can settle.

Status: **planned**. This document is the build plan; nothing below exists yet
except where marked *(exists)*.

---

## 1. Why this, why now

Manual macro entry (slice 1) proves the write path but nobody sustains it —
that was Q2's warning. The photo flow is the product's actual differentiator
and the fastest way to log food. It was originally sequenced after auth
(old slice 3) because AI calls needed a server to hold the key; the **BYOK
decision (D14)** removes that dependency: the user's own provider key, stored
on-device, calling the provider directly. No backend required, so this slice
moves ahead of auth.

## 2. User experience

### The golden path — two taps after the shutter

1. **Open the app** → lands on the new **Log** screen (now the default route,
   replacing Today as `/`). One big camera button, nothing else demanding
   attention.
2. **Tap the camera** → `<input type="file" accept="image/*"
   capture="environment">` opens the phone's camera directly (no in-app camera
   UI to build or maintain).
3. Photo returns → **analysis starts automatically** (default on, toggleable in
   Settings). A compact result card appears: per-item name, grams, kcal,
   protein, carbs, fat, each with a confidence figure, plus the model's
   assumptions ("assumed cooked weight, no oil visible").
4. **Tap Save** → meal stored. Every AI-derived item carries
   `AI_ESTIMATE` provenance with confidence and an `inferenceId`; the Nutrition
   screen's existing badge + **Confirm** button *(exists)* handle corrections.

Count: shutter + Save = the "one click to take the photo and one click to
calc" ask. Analyze is a visible step only when auto-analyze is off.

### Optional hints — the user does less, not more

Collapsible "details" row under the photo, all optional, all passed to the
model as hints it must honour:

| Field | Effect on the estimate |
|---|---|
| **Food** (free text) | Identification is taken as given; the model only portions and computes. Works for cooked meals and bare groceries alike ("cottage cheese 5%", "2 eggs"). |
| **Grams** | Total weight is taken as given; the model scales nutrients to it instead of guessing portion size — the single biggest accuracy lever. |
| **Time** | Defaults to now; sets the meal's instant (zone rules unchanged, D7). |
| Meal slot | Defaults from time of day via `suggestSlot` *(exists)*. |

### States that are not the golden path

- **No API key yet** → the Log screen shows a short setup card: what the
  feature does, what a key costs in practice (an analysis is a fraction of a
  cent on economy vision models), and a button to Settings. The manual form
  (slice 1) stays one tap away — the feature degrades, never blocks logging.
- **Analysis fails** (bad key, rate limit, network, unparseable reply) → the
  photo and hints are kept, the error is stated plainly with a Retry, and
  "log it manually instead" pre-fills the manual form with the hints.
- **Offline** → camera still works; analysis queues? **No** — v1 says "you're
  offline, analysis needs a connection", keeps the photo, offers manual entry.
  Queueing is a slice-3+ concern (needs sync semantics).
- **Desktop** → same screen; the file input becomes a picker/drag-drop. Fine.

### Navigation change

- `/` → **Log** (camera-first). Today moves to the sidebar under Overview and
  stays one tap away.
- **Mobile gets navigation for the first time**: the sidebar is currently
  `hidden` below `md`, and the phone is this feature's primary device. A
  minimal bottom bar (Log / Today / Nutrition) ships with this slice.

## 3. Scope

**In:** camera capture, downscaling, OpenAI vision call on the user's key,
structured estimate (macros), hints, save-as-estimate, Settings screen with
local key storage + test button, AIInference audit records, photo stored
locally and shown as a thumbnail, mobile bottom nav, default-route change.

**Out (explicitly):**
- **WhatsApp bot intake** — needs a server to receive webhooks; parked until
  after the cloud slice. Listed in ROADMAP "Later".
- **Vitamins/micros** — see Q9. A photo does not contain that information;
  pretending otherwise would violate the honesty rules the product is built
  on. The credible path is photo → food identity → *database* micros, which
  arrives with a food database, not a better prompt. `Nutrients` stays macros
  (+ optional fiber, which vision models can roughly infer).
- **Food database lookup** — separate feature; the AI estimate is the fast
  path (Q2).
- **Barcode scanning** — same reasoning as micros: identity → database.
- **In-app camera stream** (getUserMedia) — the file-input capture attribute
  does the job without a permissions UI, HTTPS-only constraints, or upkeep.

## 4. Architecture

### The BYOK model (new decision D14 — recorded in ARCHITECTURE.md)

The user supplies their own OpenAI API key in Settings. It is stored
**on-device only** and sent to exactly one place: the provider's API endpoint,
directly from the browser. There is no server of ours anywhere in the path —
which is what makes this slice possible before auth exists.

### The estimator port — same pattern as D3

```
src/ai/estimator.ts        FoodVisionEstimator (interface) + result types
src/ai/openaiEstimator.ts  the OpenAI adapter (fetch, prompt, parsing)
src/ai/validate.ts         response validation: unknown JSON -> EstimateResult
```

The UI depends on the interface; the adapter is chosen in the composition
root, exactly like repositories. When the backend exists (slice 3), a
server-proxy adapter implements the same interface and BYOK becomes one of two
modes rather than a rewrite. A `FakeEstimator` implements it for tests.

```ts
interface FoodVisionEstimator {
  estimate(photo: Blob, hints: EstimateHints): Promise<EstimateResult>
}
interface EstimateHints { foodName?: string; totalGrams?: number }
interface EstimateResult {
  items: EstimatedItem[]        // name, amountG, energyKcal, proteinG, carbsG, fatG, fiberG?, confidence
  overallConfidence: number     // 0..1
  assumptions: string[]         // shown to the user, stored in the inference
  raw: unknown                  // verbatim model output, kept for audit
}
```

### Data flow

```
photo (file input)
  → downscale to ≤1280px JPEG (canvas)          [cost + latency control]
  → estimator.estimate(blob, hints)             [OpenAI, user's key]
  → validate → EstimateResult
  → user reviews → Save:
      AIInference row        (purpose FOOD_PHOTO_ESTIMATE, model, confidence,
                              inputReferences=[attachmentId], output=raw)
      Attachment row         (kind FOOD_PHOTO, blob in IndexedDB)
      Meal row               (photoId set; each item provenance =
                              aiEstimate(now, confidence, inferenceId))  ← exists
```

Confirm/correct after saving is **already built** (slice 1): badge, Confirm
button, `confirmFoodItem` supersede chain, no double counting.

### Storage — IndexedDB v1 → v2, the first real migration

New stores: `attachments` (photo blobs + metadata), `inferences` (AIInference
rows), `settings` (key-value). Migration adds stores only — no row rewrites —
but exercises the `upgrade` path for real, which is deliberate practice for
slice 3.

Photos are stored downscaled (~100–300 KB each). Retention is Q10.

### Settings

New `/settings` screen and `settings` store:

| Setting | Default | Notes |
|---|---|---|
| OpenAI API key | — | password-type input; stored on-device; **never synced, never exported** — when slice 3 sync arrives, `settings` is excluded by design |
| Model | an economical vision model (final pick at build time) | free-text with a sane default; model names churn too fast to hardcode in a spec |
| Auto-analyze after photo | on | the two-tap flow |
| "Test key" button | — | one minimal API call; reports ok / 401 / network error |

## 5. The AI contract

**Request:** downscaled image + system prompt: *you are estimating nutrition
from one meal photo; honour user hints as ground truth (given grams = scale to
them, given food = identify only portions); reply as strict JSON matching the
schema; per-item and overall confidence in [0,1]; list every assumption; when
the image is not food, say so in a refusal field.*
Structured-output / JSON mode is used where the chosen model supports it.

**Validation** (`validate.ts`): hand-rolled, no new dependency — numbers
finite and ≥ 0, confidence clamped to [0,1], items non-empty, strings
trimmed; kcal cross-checked against 4/4/9 macro arithmetic and flagged (not
rejected) when >25% apart. Invalid JSON → one repair attempt ("reply with only
the JSON") → then a plain failure. The verbatim reply is stored in
`AIInference.output` either way.

**Displayed honesty:** confidence shown on every item; below 0.5 the card says
"low confidence — worth confirming" rather than hiding it. `safetyFlags`
carries the macro-arithmetic flag and any refusal.

## 6. Errors

| Failure | User sees | Kept |
|---|---|---|
| 401 | "Key rejected — check it in Settings" + link | photo, hints |
| 429 / 5xx | "Provider is busy, try again shortly" + Retry | photo, hints |
| Network | "You're offline — analysis needs a connection" | photo, hints |
| Unparseable after repair | "Couldn't read the analysis" + Retry + manual path | photo, hints, raw reply in inference |
| Not food | model's refusal, verbatim-ish | nothing saved |

Every failed attempt still writes an AIInference row (with a failure flag) —
failures are part of the audit trail too.

## 7. Security & privacy

- The key lives in IndexedDB on this device. Anyone with this browser profile
  can read it; an XSS could read it. Surface is small (static site, no
  third-party scripts) but real — stated plainly in the Settings screen, not
  buried here.
- The photo leaves the device exactly once, to the provider, over TLS, only
  when the user analyzes. Stored copies stay local.
- OpenAI's API permits browser-origin calls. **Providers differ on CORS** —
  verify per provider before ever adding one to Settings.
- Recommend (in Settings copy) a dedicated, spend-capped key.

## 8. Test plan

- **Unit:** validator (good/degenerate/hostile JSON, the 4/4/9 flag,
  clamping); grams-hint scaling; downscale respects max dimension.
- **Integration (FakeEstimator + fake-indexeddb):** photo → save writes
  Meal + Attachment + AIInference with linked ids; failure writes a flagged
  inference and no meal; confirm-after-photo-save reuses slice-1 tests' path.
- **Migration:** open a v1 database, assert v2 upgrade adds stores and keeps
  every slice-1 row readable.
- **Manual E2E (real key, real food, phone):** the two-tap path; a hostile
  photo (packaging, not-food); airplane mode.

## 9. Acceptance

- Fresh phone, key configured: **shutter + one tap** to a saved meal, protein
  visible in Today immediately after.
- No key: Log screen still useful (manual path one tap away), setup card
  shown, nothing broken.
- Every AI item shows provenance + confidence; Confirm settles it exactly as
  slice 1 does; totals never double-count.
- All existing 32 tests stay green; new tests cover §8.
- Deployed over HTTPS somewhere the phone can reach (ROADMAP's definition of
  done; a static host suffices — there is no server).

## 10. Build order (each step leaves the app working)

1. IndexedDB v2 migration + `settings` store + Settings screen with key entry
   and Test button.
2. Estimator port + validator + FakeEstimator + unit tests.
3. OpenAI adapter behind the port; manual smoke test with a real key.
4. Log screen (camera input, downscale, hints, result card, Save) wired to
   FakeEstimator first, then the real adapter via the composition root.
5. Attachment + AIInference persistence; thumbnails in Nutrition's logged list.
6. Default-route change + mobile bottom nav.
7. Deploy static build over HTTPS; phone E2E; update ROADMAP/README status.

## 11. Risks, named

- **Estimate quality varies wildly with photo quality.** Mitigated by hints
  (grams especially), confidence display, and the Confirm flow — never by
  pretending precision.
- **Model/API churn** — the model name is a setting, the adapter is one file
  behind a port.
- **Key on device** — §7; revisited when slice 3 offers the proxy mode.
- **Scope creep toward a food database** — out; the spec says why.
