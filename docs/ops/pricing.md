# What to charge

Worked out from two things that can actually be measured: what a user costs,
and what the market already charges. **Recommendation at the bottom.**

---

## What a user costs

Priced from `MODEL_RATES` in `_shared/prompt.ts`. A photo analysis is roughly
1,800 input tokens; output depends on how much the model reasons, and reasoning
tokens are billed as output while being invisible until counted — which is why
the code stores measured cost rather than estimating it.

| Model | Per analysis | 30/month | 60/month |
| --- | --- | --- | --- |
| **sol** (most accurate) | $0.05 – $0.11 | $1.60 – $3.30 | $3.20 – $6.60 |
| **terra** (balanced) | $0.02 – $0.04 | $0.65 – $1.20 | $1.30 – $2.40 |
| **luna** (fastest) | $0.002 – $0.004 | $0.07 – $0.12 | $0.13 – $0.24 |

**The model default is a pricing decision, not a product one.** Sol costs
twenty-five times what luna does for the same photograph.

Lemon Squeezy takes roughly **5% + $0.50** per transaction as merchant of
record — the fee for VAT and sales tax being their problem.

---

## What the market charges

| App | Monthly | Yearly | AI photo logging |
| --- | --- | --- | --- |
| MyFitnessPal Premium | $19.99 | $79.99 | no |
| MacroFactor | $11.99 | $71.99 | no |
| Cronometer Gold | $5.99 | $59.99 | no |
| Cal AI | $9.99 | $29.99 | yes |
| Foodvisor | $9.99 | $39.99 | yes |
| SnapCalorie | free / $8.99 | — | yes |

**The split is the finding.** Established trackers charge $60–80 a year and do
not do AI photo logging at all. The AI-photo apps charge $30–40 — half — and
compete on price, because reading a photograph is now a commodity that a dozen
apps offer and nobody switches for.

**So do not sell "AI calorie counting".** That market is a race to the bottom
and it is already crowded. What this app has that they do not is the honesty —
confidence shown, disagreeing sources surfaced, nothing overwritten — and the
breadth: nutrition beside training, recovery, sleep and body, from a watch.
That is MacroFactor's neighbourhood, not Cal AI's.

---

## The margins

Net per month after Lemon Squeezy, against a heavy user logging 60 analyses:

| Plan | Net/month | on sol | on terra | on luna |
| --- | --- | --- | --- | --- |
| $5.99/mo | $5.19 | **−$1.41** | +$2.79 | +$4.95 |
| $8.99/mo | $8.04 | +$1.44 | +$5.64 | +$7.80 |
| $39/yr | $3.05 | **−$3.55** | +$0.65 | +$2.81 |
| $59/yr | $4.63 | **−$1.97** | +$2.23 | +$4.39 |
| $79/yr | $6.21 | **−$0.39** | +$3.81 | +$5.97 |

**Every negative number in that table is sol.** A heavy user on the best model
loses money at every price the market would accept — including MyFitnessPal's.
That is not an argument for charging more. It is an argument for not making the
expensive model the default, which the app already does for the trial and
should keep doing for the paid plan.

---

## One plan or three?

`features/ai-access-plans.md` proposed three tiers, one per model — Everyday on
luna, Accurate on terra, Precision on sol. **The instinct is right and better
than a single flat price**: the cost difference between models is twenty-five
fold, and a tier makes that visible in the price rather than absorbed by it.

But it does not survive the measured numbers.

Sol measured **$0.11 a photo** through the deployed function. At three or four
meals a day — about 100 analyses a month, which is ordinary use for this app,
not heavy — that is **$11 of cost**. Add Lemon Squeezy and a Precision tier has
to be priced near **$20 a month** to be worth selling, against a market whose
most expensive serious option is MyFitnessPal at $19.99 and whose AI-photo apps
charge a third of that.

**Sol is not sellable as a consumer subscription tier.** That is the finding,
and it is better to say it than to publish a price that loses money at normal
use.

So: **one plan, on terra, with a sol allowance inside it** — exactly the shape
the trial already has (`TRIAL_SOL_ANALYSES`), which means the machinery exists
and the behaviour is already familiar to anyone who used the trial. One plan is
also one thing to explain, one thing to build, and one thing to get wrong.

---

## Recommendation

**$8.99 a month, or $59 a year.** One plan. Terra by default, with a monthly
allowance of sol analyses for the plates that need it.

- **$59/year** undercuts MacroFactor's $72 and matches Cronometer, which reads
  as a serious tool rather than a cheap one — and it is 50% more than Cal AI's
  annual, which is the right signal if the product is not competing on being
  the cheapest way to photograph a sandwich.
- **$8.99/month** is set deliberately high against the annual: paying monthly
  costs $108 a year versus $59. That gap is the point. For a one-person
  product, annual subscriptions mean cash up front and a twelfth of the churn
  work.
- **Default to terra, meter sol.** The machinery exists — `TRIAL_SOL_ANALYSES`
  and the model picker already do exactly this for the trial. Carrying it into
  the paid plan turns the one unprofitable case in the table into a bounded
  one, and it is honest: sol is slower as well as dearer, and most plates do
  not need it.

### One thing has to be built first

**There is no daily cap, and no monthly cap.** The `day` column exists for it
and `estimate-food` still carries a comment about it, but the only limit
enforced is the lifetime trial count. A paid plan without a cap is a plan whose
worst case is unbounded — and the table above shows that a sol-heavy user
already loses money at every price the market accepts.

So before billing: a per-plan monthly allowance, and a sol sub-allowance
inside it. That is the same shape as the trial, against the same ledger.

### Why not cheaper

$39/year is inside the AI-photo pack and loses money on sol even at moderate
use. It also sets an expectation that is very hard to raise later — and the
people a low price attracts are the ones most likely to leave when it rises.

### Why not dearer

$11.99/month at parity with MacroFactor asks for trust this product has not yet
earned: no reviews, no track record, one developer. Match on price when there
is something to point at.

### Launch pricing, if you want it

An introductory **$39 for the first year**, clearly labelled as introductory and
renewing at $59, converts early users without anchoring the product at the low
price permanently. Lemon Squeezy supports this as a discount code rather than a
separate plan, which keeps one price list.

---

## Before this is final

- **Decide the currency.** USD is what this table assumes and what most
  customers will pay in.
- **Check Israeli VAT on digital services.** A merchant of record handles the
  customer-side VAT; what you owe on the payouts is a question for an
  accountant.
- **Watch the first month's `admin_budget`.** Everything above is a model. The
  ledger records measured cost per call, so after thirty days of real use the
  cost column stops being an estimate — and the price can move with evidence
  rather than argument.
