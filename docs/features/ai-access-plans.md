# Feature spec — AI access: server keys, free trial, paid plans

**One line:** photo analysis stops requiring every user to bring an OpenAI
key — new users get a free trial on the owner's key, then choose between a
small monthly plan or bringing their own; keys move server-side and are never
readable by any browser again.

Status: **planned**. Sequenced before the Garmin slice at the owner's request.

**Settled (Aug 2026):** the trial is **10 analyses total**, not per day.
**Step 1 ships alone** — proxy, master key and trial — and steps 2 and 3
follow separately. Billing is **deliberately deferred**: the owner is not
ready to be a merchant, and the app should be good before anyone is asked to
pay for it. The plan below is therefore a design to build against later, not
work queued now.

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

- New signed-in users get **10 analyses total** on the master key — a
  lifetime allowance, not a daily one. Simple to explain, simple to count,
  and it costs the owner about 30 cents per person who tries the app.
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

## 4. Feature 3 — paid plans (design only; not being built yet)

**Plans are model tiers.** The owner's call, and the right one: a user is
buying a quality level, not an abstract quota, and the cost difference between
models is 20x — so it has to be visible in the price rather than absorbed.

### The cost that sets the price

Per photo ≈ ~2.5k input tokens (1280px image + prompt) + ~2k output (JSON plus
hidden reasoning), at Aug 2026 prices:

| Model | $/photo | Daily cap | Worst-case month | Realistic (3-4 meals/day) |
|---|---|---|---|---|
| **luna** ($0.20/$1.20) | ~$0.003 | 20/day | ~$1.80 | ~$0.35 |
| **terra** ($2/$12) | ~$0.03 | 10/day | ~$9 | ~$3-4 |
| **sol** ($5/$30) | ~$0.07 | — | — | ~$7-8 |

The daily cap is the abuse control: worst case is bounded by design, so a
plan cannot run away from its price.

### Suggested shape

| Plan | Model | Cap | Price | Worst-case cost | Net after 5% MoR |
|---|---|---|---|---|---|
| **Everyday** | luna | 20/day | **$4/mo** | ~$1.80 | ~$3.30 |
| **Accurate** | terra | 10/day | **$9/mo** | ~$9.00 | ~$8.05 |
| **Precision** | sol | **5/day** | **$15/mo** | ~$10.50 | ~$13.75 |

**Precision is sold, and the daily cap is what makes it possible.** At
~$0.07/photo, sol at 10/day would cost $21 in a maxed month and could not be
priced sanely. At **5 a day** the worst case is ~$10.50 against ~$13.75 net —
positive at the ceiling, and comfortably so at realistic use (3-4 meals a day
is ~100 analyses a month, about $7). Five a day is not a real constraint for a
meal log; it is a constraint on abuse.

The customer is specific and worth serving: someone who wants the most
accurate estimates and does not want to create an API key. That is most
non-technical users, and it is the whole reason the tier exists.

**The app must say that BYOK is cheaper.** Running sol on your own key costs
about $7/month at realistic use, against $15 for Precision — so the plan is
worth roughly $8/month to never think about keys, billing or spend caps. For
many people that is a fair trade; for a developer it plainly is not. The plan
picker should say so in a line, the same way this app already labels AI
estimates with their confidence and marks unbuilt features "not built yet".
A product that hides the cheaper option from the people best able to use it
has spent trust it will need later.

### Payments — deferred, and the decline is informative

Lemon Squeezy declined the owner's store application. Their wording ("we
assess the totality of data... guided by regulations imposed on us by Stripe,
PayPal and card companies") is a template, but the common cause is applying
**before there is a live product**: no working app, no pricing page, no terms
of service or privacy policy for a reviewer to look at. That application was
made when the repository was empty.

That makes the deferral fortunate rather than costly. Re-applying later —
with the app live, a real pricing page, and published terms and privacy
policy — is a materially different application, to a materially different
reviewer impression.

Providers worth applying to when the time comes, all **revenue-share only,
no monthly fee**:

| Provider | Cut | Notes |
|---|---|---|
| **Creem** | 3.9% + $0.40 (0% on first $1,000) | Cheapest full MoR; newer, smaller |
| **Paddle** | 5% + $0.50 | The established MoR; broadest tax coverage; also has an approval process |
| **Polar** | ~4% + 40c | Developer-focused, GitHub-native origins |
| **Gumroad** | 10% flat | Highest cut, but the most lenient approval — the fallback if others decline |

Integration is identical for all four: hosted checkout link from Settings →
provider webhook → an edge function (service role) writes
`subscriptions(user_id, plan, status, current_period_end)` → the proxy reads
it. The client can read its own subscription row (RLS); it can never write one.
So the provider choice is swappable and does not shape the code.

**Before applying anywhere:** publish a pricing page, terms of service and a
privacy policy (the last is required regardless — the app handles health data
and routes photos through a third-party model). Apply with the live URL.

Records as **D18**.

## 5. Analytics, and an admin who cannot read your food

The usage ledger that meters the trial is the same table that answers every
business question later, so it is designed once, now.

### What the ledger records

One append-only row per analysis attempt (D4 applied to metering):

```
usage(
  id, user_id, created_at, day,
  model,                      -- what actually ran
  key_source,                 -- 'MASTER_TRIAL' | 'MASTER_PLAN' | 'USER_KEY'
  input_tokens, output_tokens,-- as reported by OpenAI, not estimated
  cost_micros,                -- computed server-side from a rate table
  outcome                     -- 'OK' | 'REFUSED_QUOTA' | 'PROVIDER_ERROR' | 'UNREADABLE'
)
```

Token counts come back on every OpenAI response, so **cost is measured rather
than modelled** — which matters, because the margin tables above are estimates
and reasoning tokens are invisible until you count them. Recording refusals
too is what makes "how many people hit the trial wall and then left" a question
with an answer.

Rows are written by the edge function under the service role. Users may read
their own (RLS) — that is what powers "6 of 10 today". Nobody may update or
delete, same as every other table.

### D19 — the admin boundary: metadata, never health data

An admin role must **not** be a key to everyone's medical records. The whole
product rests on the opposite promise, and RLS makes the boundary explicit
rather than a matter of restraint:

| Table | Admin may read |
|---|---|
| `usage`, `subscriptions` | **yes** — all rows |
| `profiles` | limited view: id, email, created_at, plan |
| `meals`, `observations`, `sleep`, `workouts`, `goals`, `inferences` | **no — no policy is written** |

The last row is the point. Admin visibility is added by writing new SELECT
policies for admins on the metadata tables; the health tables simply never get
one, so an admin reading someone's meals is not "against policy" — it returns
zero rows. A privacy promise enforced by the database is worth more than one
kept by an operator's good manners, and this app has already used that argument
twice (D4's grants, D16's isolation).

Admin identity: an `app_admins(user_id)` table, populated by hand in the
dashboard. No self-service, no role column a bug could flip.

### What it answers

- **Money:** cost by day and by model, revenue by plan, gross margin, cost per
  active user. The number that matters most: are subsidised plans profitable
  *in practice* rather than on the table above.
- **Funnel:** signups → analyses tried → trial exhausted → subscribed / added
  own key / stopped. Trial conversion is the single most useful number for
  deciding whether any of this is worth continuing.
- **Health of the thing:** error and refusal rates by model, how often the
  repair retry fires, p95 latency.

### Build it as SQL first

**Recommendation: no admin screen initially.** Ship the ledger with a handful
of SQL views (`admin_daily_cost`, `admin_user_summary`, `admin_funnel`) and
read them in the Supabase dashboard. That is a few hours, needs no UI, no
route, no auth work, and answers every question above.

Build an in-app `/admin` screen only when the dashboard is genuinely annoying —
realistically once there are enough users that you want a chart on your phone.
Designing it now would be inventing requirements before knowing which numbers
you actually look at each week.

## 5b. What the user sees

- **Settings → "AI access"** replaces the API-key card: shows trial
  remaining / plan + usage today / "using your own key", with the right
  actions per state. The key input stays for BYOK — it now submits to the
  server (write-only) instead of localStorage when signed in.
- **Model choice belongs to the user in both modes.** On a plan, the tier
  fixes the model (that is what the tier is). On BYOK, the existing model
  picker stays exactly as it is — including sol, which is the cheapest way to
  run sol.
- **Log screen**: no setup card for new signed-in users — the trial means
  photo analysis just works, which is the whole point. Quota/trial exhaustion
  is a friendly card with the two doors, photo kept.
- A small usage line ("6 of 10 today") near the analyze action once on a plan.

## 6. Order of work (each step ships alone)

1. **Proxy + ledger + trial** ← *the only step queued now.* Edge function,
   master key as a function secret, usage ledger, `ProxyEstimator` adapter,
   trial-exhausted UI. Delivers the whole point — a new user signs in and
   photo analysis just works — with no payment infrastructure anywhere.
   Trial users run **terra** (the quality/cost knee), which at 10 analyses
   costs the owner about 30 cents per signup.
2. **Server-held BYOK** — encrypted storage, write-only API, proxy uses it;
   Settings key card moves server-side for signed-in users.
3. **Billing** — provider account, checkout, webhook, `subscriptions` table,
   plan quotas in the proxy, Settings/paywall UI (including the line saying
   BYOK is cheaper).
3b. **Analytics views** — SQL views over the ledger, read in the Supabase
   dashboard. Can ship with step 1; needs no UI.
3c. **Admin screen** — only once the dashboard is genuinely annoying.
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
