# Feature spec — AI access: server keys, free trial, paid plans

**One line:** photo analysis stops requiring every user to bring an OpenAI
key — new users get a free trial on the owner's key, then choose between a
small monthly plan or bringing their own; keys move server-side and are never
readable by any browser again.

Status: **planned**. Sequenced before the Garmin slice at the owner's request.

---

## 1. The architectural fact that shapes everything

None of these three features can live in the client:

- A master key shipped in the bundle is extracted in minutes and drained.
  It must live **server-side only**, used by code the user cannot read.
- A quota enforced by the client is a suggestion. "10 photos/day" must be
  counted and refused **server-side**, tied to the authenticated user.
- A subscription must be provable: payment webhooks land on a server and
  entitlements must be stored where the client cannot write them.

So all three features are one feature: **the server-side AI proxy** — the
"second mode" D14 explicitly reserved space for. The `FoodVisionEstimator`
port was built for exactly this: a `ProxyEstimator` is one new adapter behind
the same interface, chosen in the composition root. No screen changes.

The proxy is a Supabase Edge Function (`estimate-food`):

```
browser ──(photo + hints, JWT)──▶ edge function ──▶ OpenAI
                                     │
                                     ├─ verifies the Supabase JWT
                                     ├─ picks the key:
                                     │    subscriber / trial → MASTER key (function secret)
                                     │    BYOK user          → their stored key (decrypted server-side)
                                     ├─ enforces trial + daily quota from the usage ledger
                                     └─ appends one usage row per call
```

The photo transits the function and is **never stored** (Q10 unchanged).
CORS stops being a constraint for proxy users — the browser only ever talks
to our function.

## 2. Feature 1 — the user's key, stored server-side

This reverses D14's "the key never leaves the device" — deliberately, and it
comes out **safer than today**, because of one rule:

**Stored keys are write-only.** The client can set, replace, or delete its
key; it can never read it back. The key is encrypted at rest (Supabase
Vault / pgsodium; fallback: app-level AES-GCM with the data key held as a
function secret) and decrypted only inside the edge function at call time.

Compare the exposure honestly:

| | Today (localStorage) | After (server, write-only) |
|---|---|---|
| XSS in the app reads the key | **yes** | no — nothing readable exists client-side |
| Every device needs the key pasted | yes | no — sign in anywhere, it works |
| We can read the user's key | no | operationally yes (the function decrypts) — stated in the privacy policy, mitigated by at-rest encryption and the write-only API |

Signed-out use keeps the current local key path unchanged — no account, no
server, everything as it is today.

Records as **D17** (amends D14). Q8's "key in browser storage" concern
becomes moot for signed-in users.

## 3. Feature 2 — the free trial

- New signed-in users get **10 analyses total** on the master key
  (assumption to confirm: total, not per-day — "let them take 10 pictures
  with my key, then ask").
- Counted server-side in an **append-only usage ledger** (D4 applied to
  metering): `usage(id, user_id, day, model, created_at)`, RLS so users see
  their own rows, INSERT only via the function's service role.
- At 0 remaining, the Log screen's analyze step returns a friendly refusal
  with two doors: **subscribe** or **add your own key**. The photo and hints
  are kept, exactly like every other failure path.
- Abuse surface: a trial costs the owner ~$0.30–0.70 (10 photos). Email
  confirmation is already required; that plus the low value is acceptable.
  The ledger keys by user id, so a new email = a new trial — accepted for a
  family-scale app, revisit if it is ever farmed.

## 4. Feature 3 — paid plans

Two monthly plans, quota enforced by the same ledger the trial uses:

| Plan | Daily cap | Monthly worst case | Realistic (3–4 meals/day) |
|---|---|---|---|
| A | 10 photos/day | 300 photos | ~100–120 |
| B | 20 photos/day | 600 photos | ~100–150 |

### The cost math that sets the price

Per-photo cost ≈ ~2.5k input tokens (1280px image + prompt) + ~2k output
tokens (JSON + hidden reasoning), at Aug 2026 prices:

| Model | $/photo | Plan A worst case | Plan B worst case | Realistic month |
|---|---|---|---|---|
| gpt-5.6-sol ($5/$30) | ~$0.07 | ~$21 | ~$42 | ~$7–8 |
| **gpt-5.6-terra ($2/$12)** | **~$0.03** | **~$9** | **~$17** | **~$3–4** |
| gpt-5.6-luna ($0.2/$1.2) | ~$0.003 | ~$0.90 | ~$1.80 | ~$0.35 |

The daily caps are the abuse control: the worst case is *bounded by design*.

**Recommendation:** subsidised plans run **terra** (the quality/cost knee —
the live comparison showed it separating dry goods from cooked portions and
calibrating confidence well). BYOK users keep whatever model they like,
including sol.

**Suggested prices:** Plan A **$7/month**, Plan B **$12/month**.
After merchant fees (~5% + $0.50): A nets ~$6.15, B nets ~$10.90. Healthy
against realistic usage, break-even-ish against a maxed-out Plan A, slightly
exposed on a maxed-out Plan B — acceptable, revisit with real usage data.
(For confirmation: sol-quality plans would need ~$15/$25 to be safe, which
reads badly next to ChatGPT at $20.)

### Payments — the part that needs a business decision

The owner is in Israel, which constrains providers: **Stripe does not
support Israel-based merchant accounts** (verify current status at build
time). The practical route is a **merchant of record** — they are the legal
seller, handle global VAT/tax, and pay out to Israeli founders:

- **Paddle** — the established MoR, broadest tax coverage.
- **Lemon Squeezy** — simplest integration, 5% + $0.50/txn, though its
  roadmap post-Stripe-acquisition is a question mark.
- **Polar / Creem** — newer, developer-focused alternatives.

Integration shape is identical for all: hosted checkout link from Settings →
provider webhook → edge function (service role) writes
`subscriptions(user_id, plan, status, current_period_end)` → the proxy reads
it. The client can *read* its subscription row (RLS), never write it.

Records as **D18**.

## 5. What the user sees

- **Settings → "AI access"** replaces the API-key card: shows trial
  remaining / plan + usage today / "using your own key", with the right
  actions per state. The key input stays for BYOK — it now submits to the
  server (write-only) instead of localStorage when signed in.
- **Log screen**: no setup card for new signed-in users — the trial means
  photo analysis just works, which is the whole point. Quota/trial exhaustion
  is a friendly card with the two doors, photo kept.
- A small usage line ("6 of 10 today") near the analyze action once on a plan.

## 6. Order of work (each step ships alone)

1. **Proxy + ledger + trial** — edge function, master key as secret, usage
   table, `ProxyEstimator` adapter, trial-exhausted UI. Delivers immediate
   value (new users need no key) before any payment exists.
2. **Server-held BYOK** — encrypted storage, write-only API, proxy uses it;
   Settings key card moves server-side for signed-in users.
3. **Billing** — provider account, checkout, webhook, `subscriptions` table,
   plan quotas in the proxy, Settings/paywall UI.
4. **Docs, policies, and the boring-but-required**: privacy policy update
   (photos transit our server and OpenAI under the owner's account; keys
   stored encrypted, write-only), terms of service, OpenAI usage-policy
   check (reselling API access through an app is permitted; verify at build).

## 7. Honest risks

- **Operating a paid service is a step change**: refunds, support, tax
  residency questions, and health-data privacy expectations all become real.
  The MoR absorbs tax/compliance; the rest is the owner's.
- **Cannibalisation**: BYOK is strictly cheaper for a savvy user (~$1–3/mo
  at cost). The plans sell convenience, not access — price and copy should
  say so plainly.
- **Cost drift**: model prices change; the proxy pins the model and the
  margin table above should be re-run whenever it changes.
- **The master key is a single blast radius**: per-user quotas cap it, but
  set a hard monthly spend limit on the OpenAI org as the backstop.
