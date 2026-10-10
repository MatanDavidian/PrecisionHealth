/**
 * Is the server side able to do its job, right now?
 *
 * Called once a day by the scheduled health check (.github/workflows), and by
 * the deploy script after every deploy. It answers four questions:
 *
 *   - which commit is deployed                     (`version`)
 *   - does the database have everything the code calls   (`schema`)
 *   - are the secrets the functions need set             (`secrets`)
 *   - what happened in the last 24 hours: spend against the day's ceiling,
 *     and how many analyses ended in each outcome        (`last24h`)
 *
 * It exists because of 25 Sep 2026, when analyses failed for a week on a
 * missing migration and nothing said so. The schema check alone would have
 * caught that the next morning.
 *
 * Not public. It answers only a caller presenting `x-health-token`, and even
 * then returns names and counts — never a user, an email, a record, or the
 * value of any secret. `verify_jwt` is off for it: the caller is a scheduled
 * job, not a person.
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { EXPECTED_SCHEMA } from '../_shared/schema.ts'
import {
  DEFAULT_PLAN_DAILY_BUDGET_MICROS,
  TRIAL_MODELS,
  dailyBudgetMicros,
  providerCode,
} from '../_shared/prompt.ts'

/**
 * Every OpenAI key the functions use, by the names they read it under.
 *
 * Each is tried against every model the app offers, because a key can be
 * valid and still unable to run a model: on 10 Oct 2026 the trial project
 * could not use GPT-6, every trial and subscriber analysis failed, and this
 * check — which only ever analysed on the admin key — stayed green.
 */
const OPENAI_KEYS: [string, string[]][] = [
  ['trial', ['OPENAI_TRIAL_KEY', 'OPENAI_MASTER_KEY']],
  ['plans', ['OPENAI_PLANS_KEY', 'OPENAI_PLAN_KEY']],
  ['admin', ['OPENAI_ADMIN_KEY']],
]

interface Probe {
  key: string
  model: string
  ok: boolean
  status?: number
  code?: string
}

/** A one-word reply: costs a fraction of a cent, and proves the key can run the model. */
async function probe(key: string, apiKey: string, model: string): Promise<Probe> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with the word ok.' }],
        max_completion_tokens: 64,
      }),
    })
    if (response.ok) {
      await response.body?.cancel()
      return { key, model, ok: true }
    }
    return { key, model, ok: false, status: response.status, code: providerCode(await response.text()) }
  } catch {
    return { key, model, ok: false, code: 'unreachable' }
  }
}

const CORS = {
  'x-vimetry-version': VERSION,
  'Access-Control-Expose-Headers': 'x-vimetry-version',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-health-token, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** Compares without leaking, through timing, how much of the token was right. */
function sameToken(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let difference = a.length ^ b.length
  for (let i = 0; i < b.length; i += 1) difference |= (a[i] ?? 0) ^ b[i]
  return difference === 0
}

/**
 * The secrets the functions read, by the names they read them under.
 *
 * Each entry is a group: satisfied when ANY name in it is set, because
 * `estimate-food` accepts the older OPENAI_MASTER_KEY in place of
 * OPENAI_TRIAL_KEY.
 */
const REQUIRED_SECRETS: string[][] = [
  ['OPENAI_TRIAL_KEY', 'OPENAI_MASTER_KEY'],
  ['SUPABASE_URL'],
  ['SUPABASE_SERVICE_ROLE_KEY'],
  ['SUPABASE_ANON_KEY'],
]

/**
 * When the Lemon Squeezy API key stops working, read from the key itself.
 *
 * The key is a JWT with an `exp` claim. Reading it needs no verification —
 * nothing is trusted from it but a date — and lets the daily check warn
 * before checkout, the portal and cancelling-on-delete quietly start
 * failing. Only the date is returned, never the key.
 */
export function keyExpiry(key: string | undefined): string | null {
  const payload = key?.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims.exp === 'number' ? new Date(claims.exp * 1000).toISOString() : null
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const expected = Deno.env.get('HEALTH_TOKEN')
  if (!expected) return json({ ok: false, error: 'not_configured' }, 503)
  if (!sameToken(request.headers.get('x-health-token') ?? '', expected)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const secretsMissing = REQUIRED_SECRETS.filter((group) => !group.some((name) => Deno.env.get(name)))
    .map((group) => group.join(' or '))

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: missing, error: schemaError } = await admin.rpc('health_missing', {
    p_functions: EXPECTED_SCHEMA.functions,
    p_tables: EXPECTED_SCHEMA.tables,
    p_outcomes: EXPECTED_SCHEMA.outcomes,
  })
  const schemaMissing: string[] = schemaError
    ? // The check itself missing is the most likely reason it cannot answer.
      [`health check unavailable: ${schemaError.code ?? 'error'}`]
    : (missing as string[] | null) ?? []

  /*
    The day's spend the same way `estimate-food` counts it — owner-paid rows
    since midnight UTC — so the number here is the number the ceiling sees.
  */
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const midnight = new Date()
  midnight.setUTCHours(0, 0, 0, 0)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [
    { data: today, error: spendError },
    { data: recent, error: recentError },
    { data: errorRows, error: errorsError },
    { data: disputeRows, error: disputesError },
  ] = await Promise.all([
    admin
      .from('usage')
      .select('cost_micros, key_source')
      .in('key_source', ['MASTER_TRIAL', 'MASTER_PLAN', 'MASTER_ADMIN'])
      .gte('created_at', midnight.toISOString()),
    admin.from('usage').select('outcome').gte('created_at', since),
    // Today's and yesterday's rows: what broke in browsers, counted (migration 0015).
    admin.from('client_errors').select('count, message, route, version, kind').gte('day', yesterday),
    /*
      Chargebacks. Lemon Squeezy's docs do not describe its dispute events, so
      the webhook logs them unhandled (billing_events) and this surfaces them
      for the owner to act on by hand, until a real one shows what they carry.
    */
    admin
      .from('billing_events')
      .select('event_name, object_id, received_at')
      .like('event_name', 'dispute_%')
      .gte('received_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const outcomes: Record<string, number> = {}
  for (const row of (recent as { outcome: string }[] | null) ?? []) {
    outcomes[row.outcome] = (outcomes[row.outcome] ?? 0) + 1
  }
  // Two ceilings, summed the way estimate-food sums each: trials (and admins), and the plan.
  const spent = (plan: boolean) =>
    ((today as { cost_micros: number | null; key_source: string }[] | null) ?? [])
      .filter((row) => (row.key_source === 'MASTER_PLAN') === plan)
      .reduce((total, row) => total + (Number(row.cost_micros) || 0), 0)
  const spentMicros = spent(false)
  const ceilingMicros = dailyBudgetMicros(Deno.env.get('DAILY_BUDGET_MICROS'))
  const planSpentMicros = spent(true)
  const planCeilingMicros = dailyBudgetMicros(
    Deno.env.get('PLAN_DAILY_BUDGET_MICROS'),
    DEFAULT_PLAN_DAILY_BUDGET_MICROS,
  )

  const errors = ((errorRows as { count: number; message: string; route: string | null; version: string | null; kind: string }[] | null) ?? [])
  const clientErrors = errorsError
    ? { error: 'client_errors unreadable' }
    : {
        total: errors.reduce((sum, row) => sum + row.count, 0),
        distinct: errors.length,
        top: [...errors].sort((a, b) => b.count - a.count).slice(0, 3)
          .map(({ count, message, route, version, kind }) => ({ count, kind, message, route, version: version?.slice(0, 7) })),
      }

  // Only keys that are set, and each distinct key once under its first name.
  const seen = new Set<string>()
  const keys = OPENAI_KEYS.flatMap(([key, names]) => {
    const value = names.map((name) => Deno.env.get(name)).find(Boolean)
    if (!value || seen.has(value)) return []
    seen.add(value)
    return [[key, value] as const]
  })
  const probes = await Promise.all(
    keys.flatMap(([key, value]) => TRIAL_MODELS.map((model) => probe(key, value, model))),
  )

  const ok =
    schemaMissing.length === 0 && secretsMissing.length === 0 && !spendError && !recentError &&
    probes.every((p) => p.ok)

  return json(
    {
      ok,
      version: VERSION,
      schema: { ok: schemaMissing.length === 0, missing: schemaMissing },
      secrets: { ok: secretsMissing.length === 0, missing: secretsMissing },
      last24h:
        spendError || recentError
          ? { error: 'usage ledger unreadable' }
          : { spentTodayMicros: spentMicros, ceilingMicros, planSpentTodayMicros: planSpentMicros, planCeilingMicros, outcomes },
      clientErrors,
      openai: probes,
      disputes: disputesError
        ? { error: 'billing_events unreadable' }
        : { last30days: (disputeRows as { event_name: string; object_id: string; received_at: string }[] | null) ?? [] },
      billing: {
        configured: ['LEMONSQUEEZY_API_KEY', 'LEMONSQUEEZY_WEBHOOK_SECRET', 'LEMONSQUEEZY_STORE_ID', 'LEMONSQUEEZY_VARIANT_ID']
          .every((name) => Deno.env.get(name)),
        testMode: Deno.env.get('LEMONSQUEEZY_TEST_MODE') === '1',
        apiKeyExpiresAt: keyExpiry(Deno.env.get('LEMONSQUEEZY_API_KEY')),
      },
    },
    ok ? 200 : 503,
  )
})
