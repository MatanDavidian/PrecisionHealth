/**
 * Photo analysis on the owner's key — the server-side proxy D14 reserved
 * space for.
 *
 * Everything here exists because it cannot be done in a browser: a master key
 * shipped to the client is extracted in minutes, and a quota the client counts
 * is a suggestion. So the key lives as a function secret, the count comes from
 * the ledger, and the refusal happens here.
 *
 * What this function does NOT do: store the photo (Q10 — it exists in memory
 * for one request), or return the master key in any form.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  SYSTEM_PROMPT,
  TRIAL_ANALYSES,
  TRIAL_MODEL,
  costMicros,
  hintText,
  type EstimateHints,
} from '../_shared/prompt.ts'

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MAX_COMPLETION_TOKENS = 4000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

interface RequestBody {
  /** Data URL of the downscaled photo. Held in memory, never stored. */
  photo: string
  hints?: EstimateHints
  /** The user's local day, so a daily cap means their day and not UTC (D7). */
  day: string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const masterKey = Deno.env.get('OPENAI_MASTER_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Who is asking. The anon client verifies the caller's own JWT; the service
  // client is used only to append to the ledger, which users cannot write.
  const authHeader = request.headers.get('Authorization') ?? ''
  const asCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await asCaller.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'not_signed_in' }, 401)

  const admin = createClient(supabaseUrl, serviceRole)

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!body?.photo || !body?.day) return json({ error: 'bad_request' }, 400)

  const record = (fields: Record<string, unknown>) =>
    admin.from('usage').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      day: body.day,
      ...fields,
    })

  if (!masterKey) {
    // Misconfiguration, not the user's fault — say so rather than blaming them.
    await record({ model: TRIAL_MODEL, key_source: 'MASTER_TRIAL', outcome: 'REFUSED_NO_KEY' })
    return json({ error: 'master_key_missing' }, 503)
  }

  // --- entitlement -----------------------------------------------------------
  // Step 1 has one entitlement: the lifetime trial. Plans land in step 3 and
  // slot in here, which is why the ledger already records key_source.
  const { count, error: countError } = await admin
    .from('usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('key_source', 'MASTER_TRIAL')
    .eq('outcome', 'OK')

  if (countError) return json({ error: 'ledger_unavailable' }, 503)

  const used = count ?? 0
  if (used >= TRIAL_ANALYSES) {
    await record({ model: TRIAL_MODEL, key_source: 'MASTER_TRIAL', outcome: 'REFUSED_QUOTA' })
    return json(
      { error: 'trial_exhausted', used, allowance: TRIAL_ANALYSES },
      402,
    )
  }

  // --- the call --------------------------------------------------------------
  const model = TRIAL_MODEL
  let response: Response
  try {
    response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: hintText(body.hints ?? {}) },
              { type: 'image_url', image_url: { url: body.photo, detail: 'auto' } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
      }),
    })
  } catch {
    await record({ model, key_source: 'MASTER_TRIAL', outcome: 'PROVIDER_ERROR' })
    return json({ error: 'provider_unreachable' }, 502)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    await record({ model, key_source: 'MASTER_TRIAL', outcome: 'PROVIDER_ERROR' })

    /**
     * The owner's budget is spent, not the user's trial.
     *
     * A monthly spend cap turns every call into a 429, and "the analysis
     * service could not complete this" would send the user hunting for a fault
     * on their side. This says the free analyses are unavailable and points at
     * the door that still works — their own key — while the ledger records
     * PROVIDER_ERROR, so the failed attempt does NOT consume a trial (only
     * outcome='OK' counts).
     */
    const outOfBudget = /insufficient_quota|billing_hard_limit|exceeded your current quota/i.test(detail)
    if (outOfBudget || response.status === 429) {
      return json({ error: 'free_analysis_unavailable' }, 503)
    }

    // The provider's own message could name the owner's account; never relay it.
    return json({ error: 'provider_error', status: response.status }, 502)
  }

  const payload = await response.json()
  const content: string | undefined = payload?.choices?.[0]?.message?.content
  const inputTokens: number = payload?.usage?.prompt_tokens ?? 0
  const outputTokens: number = payload?.usage?.completion_tokens ?? 0

  if (!content) {
    await record({
      model,
      key_source: 'MASTER_TRIAL',
      outcome: 'UNREADABLE',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_micros: costMicros(model, inputTokens, outputTokens),
    })
    return json({ error: 'empty_reply' }, 502)
  }

  // Validation stays on the client, where `validateEstimate` already lives and
  // is tested — the function returns the model's reply and the facts about the
  // call, and does not grow a second copy of the rules.
  await record({
    model,
    key_source: 'MASTER_TRIAL',
    outcome: 'OK',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_micros: costMicros(model, inputTokens, outputTokens),
  })

  return json({
    content,
    model,
    trial: { used: used + 1, allowance: TRIAL_ANALYSES },
  })
})
