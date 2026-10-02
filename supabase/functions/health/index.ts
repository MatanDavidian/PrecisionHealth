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
import { dailyBudgetMicros } from '../_shared/prompt.ts'

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
  const [{ data: today, error: spendError }, { data: recent, error: recentError }] = await Promise.all([
    admin
      .from('usage')
      .select('cost_micros')
      .in('key_source', ['MASTER_TRIAL', 'MASTER_PLAN', 'MASTER_ADMIN'])
      .gte('created_at', midnight.toISOString()),
    admin.from('usage').select('outcome').gte('created_at', since),
  ])

  const outcomes: Record<string, number> = {}
  for (const row of (recent as { outcome: string }[] | null) ?? []) {
    outcomes[row.outcome] = (outcomes[row.outcome] ?? 0) + 1
  }
  const spentMicros = ((today as { cost_micros: number | null }[] | null) ?? []).reduce(
    (total, row) => total + (Number(row.cost_micros) || 0),
    0,
  )
  const ceilingMicros = dailyBudgetMicros(Deno.env.get('DAILY_BUDGET_MICROS'))

  const ok =
    schemaMissing.length === 0 && secretsMissing.length === 0 && !spendError && !recentError

  return json(
    {
      ok,
      version: VERSION,
      schema: { ok: schemaMissing.length === 0, missing: schemaMissing },
      secrets: { ok: secretsMissing.length === 0, missing: secretsMissing },
      last24h:
        spendError || recentError
          ? { error: 'usage ledger unreadable' }
          : { spentTodayMicros: spentMicros, ceilingMicros, outcomes },
    },
    ok ? 200 : 503,
  )
})
