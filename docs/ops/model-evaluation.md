# Model evaluation — GPT-6.1 Sol and GPT-6 Luna

Status (2026-10-09): **switched, not yet measured.** The owner chose to offer
only these two models. The dropdown in Settings → Photo analysis lists them;
the server runs nothing else (`TRIAL_MODELS` in
`supabase/functions/_shared/prompt.ts`).

## The models

| Model | Input $/M | Output $/M | Role |
| --- | --- | --- | --- |
| `gpt-6.1-sol` | 2 | 10 | "Most accurate". The default, and the **quality baseline** |
| `gpt-6-luna` | 0.10 | 0.50 | "Fastest". The daily health check runs on it |

Not offered:
- `gpt-6-sol`, superseded by 6.1
- `gpt-6-astra`, an agentic frontier model. It is also filtered out of the
  own-key list (`/astra/i`).
- the gpt-5.6 family, retired from the app. A request that names any of these
  runs on the default instead.

There is no `gpt-6-terra`.

All ten trial analyses may run on either model. The separate 4-analysis
allowance for the best model existed only because gpt-5.6-sol cost $5 / $30
per million tokens, so it is gone.

The GPT-6 prices come from pricing trackers
(anotherwrapper.com/tools/llm-pricing/gpt-6.1-sol, aireiter.com/chat/gpt-6-1-sol),
because OpenAI's own pricing page could not be loaded from here. **Confirm them
in the OpenAI dashboard.** A wrong rate only skews the ledger's recorded cost
and the daily spend ceiling. It never changes what a user pays.

## What was checked

All of this was run on 2026-10-09, with the account's own key:

- `/v1/models` lists both models.
- Each model took one CC0 photo of a plate, using the server's exact request
  shape: an `image_url` part, `response_format: json_object` and
  `max_completion_tokens`. Each returned valid JSON.
- Reasoning tokens are billed as output. On that photo the reasoning tokens
  were about 150 for 6.1-sol and about 370 for 6-luna. Even so, Luna costs
  well under a tenth of a cent per analysis.
- 6.1-sol named every item correctly. That is one photo, not an evaluation.

## The evaluation still to do (owner)

With real meal photos, ideally 20 or more with known portions:

1. Analyse each photo with both models.
2. Score Luna against `gpt-6.1-sol`, and both against the truth where it is
   known:
   - items named
   - calories within ±20%
   - protein within ±20%
3. For each model, record:
   - latency
   - follow-up questions asked
   - cost per analysis (from the `usage` table)
4. Then:
   - re-measure the cost per analysis
   - update `docs/ops/pricing.md`
   - decide which models subscribers get
