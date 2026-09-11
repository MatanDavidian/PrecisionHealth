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

Lemon Squeezy takes **5% + $0.50, plus 0.5% for subscriptions** — so **5.5% +
$0.50** on everything here. International cards, PayPal and payouts can add
more. An earlier version of this page used 5% and understated every margin
below as a result.

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

Net per month after Lemon Squeezy at 5.5% + $0.50, against **100 analyses a
month** — three or four meals a day, which is ordinary use for a meal log, not
heavy use. An earlier version of this page modelled 60 and was optimistic by
two thirds.

| Plan | Net/month | terra @ $0.05 | sol @ $0.11 |
| --- | --- | --- | --- |
| $8.99/mo | $8.00 | +$3.00 | **−$3.00** |
| $59/yr | $4.60 | **−$0.40** | **−$6.40** |
| $79/yr | $6.18 | +$1.18 | **−$4.82** |
| $99/yr | $7.75 | +$2.75 | **−$3.25** |

**$59 a year loses money at ordinary use on the cheaper model, before any
hosting, support or failed-request cost.** That is not a thin margin, it is a
negative one, and it was in the recommendation on this page until it was
checked properly.

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

What the evidence actually supports is narrower than "sol is not sellable":
**the sol tier as proposed, at that price and with no allowance, is not
financially safe.** Sol could still work behind a small included allowance, as
a paid add-on, or in a dearer tier. Whether anyone would buy it is a separate
question that no number here answers.

**And one claim underneath all of this has never been tested.** The tier names
— *Accurate*, *Precision* — assert that a costlier model gives better
nutritional estimates. That is plausible and unmeasured. For an app whose whole
character is refusing to overclaim, selling a quality difference nobody has
evaluated would be the most expensive kind of inconsistency.

So: **one plan, on terra, with a sol allowance inside it** — exactly the shape
the trial already has (`TRIAL_SOL_ANALYSES`), which means the machinery exists
and the behaviour is already familiar to anyone who used the trial. One plan is
also one thing to explain, one thing to build, and one thing to get wrong.

---

## Recommendation

**$8.99 a month as a candidate. No annual price yet.** One plan, terra by
default, with a monthly sol allowance — and the allowance decided before the
price, not after.

Work the offer out in this order, because any other order prices a hypothesis:

```
measured usage cost  →  included allowance  →  margin  →  monthly and annual
```

Only the first step is missing, and it is the only one that cannot be argued —
it has to be measured.

- **$59/year** undercuts MacroFactor's $72 and matches Cronometer, which reads
  as a serious tool rather than a cheap one — and it is 50% more than Cal AI's
  annual, which is the right signal if the product is not competing on being
  the cheapest way to photograph a sandwich.
- **$8.99/month** is the candidate, and it survives the corrected arithmetic at
  +$3.00 a month on terra.
- **The annual price is withdrawn.** $59 is negative; $79 is +$1.18, which is
  not margin, it is rounding. An annual plan is worth having — it is cash up
  front, and fewer renewal events — but it does **not** reduce the work to a
  twelfth, because twelve months of service and support are still owed. Set it
  once the allowance is known.
- **Default to terra, meter sol.** The machinery exists — `TRIAL_SOL_ANALYSES`
  and the model picker already do exactly this for the trial. Carrying it into
  the paid plan turns the one unprofitable case in the table into a bounded
  one, and it is honest: sol is slower as well as dearer, and most plates do
  not need it.

### What the one measurement does and does not establish

$0.1108 came from a single real call on a **25-item grocery display** — chosen
because it was a hard case. It establishes the cost of that request. It does
not establish the average cost of an ordinary plate, a maximum, or the
distribution across real users, and it has been used on this page as though it
were all three.

The ledger already records measured tokens and cost per call, so this is a
query rather than a project:

```sql
select model,
       count(*)                                   as calls,
       round(avg(cost_micros)/1000000.0, 4)       as avg_usd,
       round((percentile_cont(0.5)  within group (order by cost_micros))/1000000.0, 4) as median_usd,
       round((percentile_cont(0.95) within group (order by cost_micros))/1000000.0, 4) as p95_usd,
       round(max(cost_micros)/1000000.0, 4)       as max_usd
from public.usage
where outcome in ('OK','OK_FOLLOWUP') and cost_micros is not null
group by model order by calls desc;
```

The p95 is the number an allowance should be sized against. The median is the
number a price should be sized against.

### What has to be built first

> **Partly done, 2026-09-11.** The atomic reservation exists — migration 0011,
> `reserve_analysis`/`settle_analysis`/`release_analysis`, verified against real
> Postgres. The trial now claims a slot before the model is called rather than
> counting afterwards, and `p_period_start` makes the same function serve a
> monthly allowance the day a plan exists. What remains is the plan itself: the
> sol sub-allowance, a visible balance and reset date, and bounded retries.

**There is no daily cap, and no monthly cap.** The `day` column exists for it
and `estimate-food` still carries a comment about it, but the only limit
enforced is the lifetime trial count. A paid plan without a cap is a plan whose
worst case is unbounded — and the table above shows that a sol-heavy user
already loses money at every price the market accepts.

So before billing:

- **A monthly allowance**, with a sol sub-allowance inside it. Monthly governs
  the economics; a daily cap is worth adding on top, but only as burst
  protection.
- **An atomic reservation before the model is called.** The trial's check is
  read-then-act, which two concurrent requests can both pass. Under a paid plan
  that is a way to exceed an allowance rather than a rounding error.
- **Bounded input and output, and bounded retries.** A count of requests does
  not cap dollars: one request on a crowded photo cost $0.11 while a simple
  plate costs a fraction of that, and a retry loop multiplies whichever it hit.
- **A visible reset date and remaining balance** — and monthly allowances for
  annual subscribers too, or an annual plan is a year-long unbounded liability.

That is the same shape as the trial, against the same ledger, with the race
closed.

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
