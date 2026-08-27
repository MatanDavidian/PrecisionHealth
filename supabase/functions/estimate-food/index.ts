/**
 * Food analysis on the owner's key — the server-side proxy D14 reserved space
 * for.
 *
 * Everything here exists because it cannot be done in a browser: a master key
 * shipped to the client is extracted in minutes, and a quota the client counts
 * is a suggestion. So the key lives as a function secret, the count comes from
 * the ledger, and the refusal happens here.
 *
 * Takes a photo OR a written description. They are the same call as far as
 * entitlement is concerned — one of the owner's analyses either way — so the
 * quota, the ledger and the model clamp are shared, and only the message sent
 * to OpenAI differs.
 *
 * What this function does NOT do: store the photo (Q10 — it exists in memory
 * for one request), store the description, or return the master key in any
 * form.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  MAX_FOLLOW_UPS,
  MODEL_SOL,
  MODEL_TERRA,
  SYSTEM_PROMPT,
  TEXT_SYSTEM_PROMPT,
  TRIAL_ANALYSES,
  TRIAL_MODEL,
  TRIAL_MODELS,
  TRIAL_SOL_ANALYSES,
  costMicros,
  describedFoodText,
  followUpText,
  hintText,
  type EstimateHints,
  type FollowUp,
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
  photo?: string
  /** What the user wrote instead, when there is no photo. Also never stored. */
  text?: string
  hints?: EstimateHints
  /** The user's local day, so a daily cap means their day and not UTC (D7). */
  day: string
  /** Which model the user asked for. Validated here; never trusted. */
  model?: string
  /** The exchange so far, when the model asked something and the user replied. */
  answers?: FollowUp[]
  /**
   * Which meal this call is about. Claimed by the client, verified here
   * against the ledger — a follow-up is only free if there is a conversation
   * to be following up on.
   */
  conversationId?: string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  /**
   * One key per audience, each scoped to its own OpenAI PROJECT with its own
   * hard spend limit — so trial users exhausting their budget cannot stop the
   * owner from logging their own dinner.
   *
   * OPENAI_MASTER_KEY is still read as a fallback so an existing deployment
   * keeps working after this rename.
   */
  const trialKey = Deno.env.get('OPENAI_TRIAL_KEY') ?? Deno.env.get('OPENAI_MASTER_KEY')
  const adminKey = Deno.env.get('OPENAI_ADMIN_KEY') ?? trialKey
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

  // Owners analyse without a quota, on their own key.
  const { data: adminRow } = await admin
    .from('app_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const isAdmin = Boolean(adminRow)
  const keySource = isAdmin ? 'MASTER_ADMIN' : 'MASTER_TRIAL'
  const apiKey = isAdmin ? adminKey : trialKey

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  // One input or the other, never neither. A photo wins if both arrive, since
  // it is the stronger evidence and sending both is a client bug, not a mode.
  const described = typeof body?.text === 'string' ? body.text.trim() : ''
  if ((!body?.photo && !described) || !body?.day) return json({ error: 'bad_request' }, 400)

  const conversationId =
    typeof body.conversationId === 'string' && body.conversationId.length > 0
      ? body.conversationId.slice(0, 64)
      : undefined

  const record = (fields: Record<string, unknown>) =>
    admin.from('usage').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      day: body.day,
      conversation_id: conversationId ?? null,
      ...fields,
    })

  /**
   * Is this a free follow-up, or another analysis?
   *
   * Free requires a conversation that actually exists in the ledger and has
   * not already had its allowance of questions. A client claiming a follow-up
   * with no prior row is claiming a discount on a purchase it never made, and
   * is simply charged; so is one past the cap, which never blocks the user —
   * it just stops being free.
   */
  const answers: FollowUp[] = Array.isArray(body.answers) ? body.answers.slice(0, MAX_FOLLOW_UPS) : []
  let isFollowUp = false
  if (answers.length > 0 && conversationId) {
    const { count: priorTotal } = await admin
      .from('usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .in('outcome', ['OK', 'OK_FOLLOWUP'])
    const { count: priorFollowUps } = await admin
      .from('usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .eq('outcome', 'OK_FOLLOWUP')
    isFollowUp = (priorTotal ?? 0) > 0 && (priorFollowUps ?? 0) < MAX_FOLLOW_UPS
  }
  /** What a successful call records. The whole of the follow-up discount. */
  const okOutcome = isFollowUp ? 'OK_FOLLOWUP' : 'OK'

  if (!apiKey) {
    // Misconfiguration, not the user's fault — say so rather than blaming them.
    await record({ model: TRIAL_MODEL, key_source: keySource, outcome: 'REFUSED_NO_KEY' })
    return json({ error: 'master_key_missing' }, 503)
  }

  // --- entitlement -----------------------------------------------------------
  // Step 1 has one entitlement: the lifetime trial. Plans land in step 3 and
  // slot in here, which is why the ledger already records key_source.
  let used = 0
  let solUsed = 0
  /**
   * What the user asked for, clamped to what they may actually have.
   *
   * The client shows a picker, but the picker is a convenience — the budget
   * lives here, because a limit the browser enforces is a suggestion.
   */
  let effectiveModel: string = TRIAL_MODEL
  let downgraded = false

  if (!isAdmin) {
    const { count, error: countError } = await admin
      .from('usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('key_source', 'MASTER_TRIAL')
      .eq('outcome', 'OK')

    if (countError) return json({ error: 'ledger_unavailable' }, 503)

    used = count ?? 0
    /**
     * A follow-up is part of an analysis already paid for, so the wall does not
     * apply to it — otherwise the tenth photo could ask a question the user is
     * then refused permission to answer, which would be a strange way to spend
     * someone's last free analysis.
     */
    if (used >= TRIAL_ANALYSES && !isFollowUp) {
      await record({ model: TRIAL_MODEL, key_source: 'MASTER_TRIAL', outcome: 'REFUSED_QUOTA' })
      return json({ error: 'trial_exhausted', used, allowance: TRIAL_ANALYSES }, 402)
    }

    const { count: solCount } = await admin
      .from('usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('key_source', 'MASTER_TRIAL')
      .eq('outcome', 'OK')
      .eq('model', MODEL_SOL)
    solUsed = solCount ?? 0

    const requested = body.model && TRIAL_MODELS.includes(body.model as never)
      ? body.model
      : TRIAL_MODEL

    if (requested === MODEL_SOL && solUsed >= TRIAL_SOL_ANALYSES) {
      /**
       * The sol budget is spent. Analyse on terra rather than refusing — the
       * user has a photo in front of them and wants an answer — but say so in
       * the reply, because quietly substituting a weaker model for the one
       * they picked is exactly the sort of thing this app does not do.
       */
      effectiveModel = MODEL_TERRA
      downgraded = true
    } else {
      effectiveModel = requested
    }
  } else {
    // Admins get whatever they ask for, since they are paying for it.
    effectiveModel =
      body.model && TRIAL_MODELS.includes(body.model as never) ? body.model : TRIAL_MODEL
  }

  // --- the call --------------------------------------------------------------
  const model = effectiveModel
  let response: Response
  try {
    response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: body.photo ? SYSTEM_PROMPT : TEXT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: body.photo
              ? [
                  { type: 'text', text: hintText(body.hints ?? {}) },
                  { type: 'image_url', image_url: { url: body.photo, detail: 'auto' } },
                ]
              : describedFoodText(described, body.hints ?? {}),
          },
          // The API is stateless, so the exchange is re-sent with the evidence.
          ...(answers.length > 0
            ? [{ role: 'user', content: followUpText(answers) }]
            : []),
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
      }),
    })
  } catch {
    await record({ model, key_source: keySource, outcome: 'PROVIDER_ERROR' })
    return json({ error: 'provider_unreachable' }, 502)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    await record({ model, key_source: keySource, outcome: 'PROVIDER_ERROR' })

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
      key_source: keySource,
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
    key_source: keySource,
    outcome: okOutcome,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_micros: costMicros(model, inputTokens, outputTokens),
  })

  /** A free follow-up spends nothing, so the counts it reports do not move. */
  const spent = isFollowUp ? 0 : 1

  return json({
    content,
    model,
    downgraded,
    followUp: isFollowUp,
    // Admins have no allowance to report.
    trial: isAdmin
      ? undefined
      : {
          used: used + spent,
          allowance: TRIAL_ANALYSES,
          solUsed: model === MODEL_SOL ? solUsed + spent : solUsed,
          solAllowance: TRIAL_SOL_ANALYSES,
        },
  })
})
