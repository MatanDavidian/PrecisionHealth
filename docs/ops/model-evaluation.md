# Model evaluation — GPT-6 against GPT-5.6

Status (2026-10-09): **GPT-6 offered, not yet measured.** The dropdown in
Settings → Photo analysis offers six models. The default is still
`gpt-5.6-sol` (`TRIAL_MODEL`) until the evaluation below says otherwise.

## The models

| Model | Input $/M | Output $/M | Offered | Notes |
| --- | --- | --- | --- | --- |
| `gpt-6.1-sol` | 2 | 10 | yes | **Quality baseline** for the evaluation |
| `gpt-6-sol` | 2 | 10 | yes | |
| `gpt-6-luna` | 0.10 | 0.50 | yes | |
| `gpt-5.6-sol` | 5 | 30 | yes | Current default; limited to 4 trial analyses |
| `gpt-5.6-terra` | 2 | 12 | yes | |
| `gpt-5.6-luna` | 0.20 | 1.20 | yes | The daily health check uses this one |
| `gpt-6-astra` | — | — | **no** | Agentic frontier model; never offered |

There is no `gpt-6-terra`.

The GPT-6 prices come from pricing trackers
(anotherwrapper.com/tools/llm-pricing/gpt-6.1-sol, aireiter.com/chat/gpt-6-1-sol),
because OpenAI's own pricing page could not be loaded from here. **Confirm them
in the OpenAI dashboard.** A wrong rate only skews the ledger's recorded cost
and the daily spend ceiling. It never changes what a user pays.

## What was checked

All of this was run on 2026-10-09, with the account's own key:

- `/v1/models` lists all four GPT-6 models (astra included, which is why the
  bring-your-own-key list filters `/astra/i`).
- Each GPT-6 model took one CC0 photo of a plate, using the server's exact
  request shape: an `image_url` part, `response_format: json_object` and
  `max_completion_tokens`. Each returned valid JSON.
- Reasoning tokens are billed as output. On that photo the reasoning tokens
  were:
  - 6-sol: about 350
  - 6.1-sol: about 150
  - 6-luna: about 370

  Even so, 6-luna costs well under a tenth of a cent per analysis.
- 6.1-sol was the only one to name every item correctly. That is one photo,
  not an evaluation.

## The evaluation still to do (owner)

With real meal photos, ideally 20 or more with known portions:

1. Analyse each photo with every offered model.
2. Score each model against `gpt-6.1-sol`, and against the truth where it is
   known:
   - items named
   - calories within ±20%
   - protein within ±20%
3. For each model, record:
   - latency
   - follow-up questions asked
   - cost per analysis (Settings shows it, and so does the `usage` table)

## Deciding

- **If the GPT-6 models match or beat GPT-5.6:**
  - drop GPT-5.6 from `TRIAL_MODELS` in `supabase/functions/_shared/prompt.ts`
  - point `TRIAL_MODEL` at the winner
  - remove the sol sub-allowance (`TRIAL_SOL_ANALYSES`), which exists only
    because gpt-5.6-sol costs 2.5× terra
  - move the health check to `gpt-6-luna`
- **Then** decide which models subscribers get. That decision was deferred
  until this evaluation.
