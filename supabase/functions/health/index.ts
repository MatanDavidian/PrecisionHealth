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
import { DEFAULT_PLAN_DAILY_BUDGET_MICROS, dailyBudgetMicros } from '../_shared/prompt.ts'

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
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [
    { data: today, error: spendError },
    { data: recent, error: recentError },
    { data: errorRows, error: errorsError },
  ] = await Promise.all([
    admin
      .from('usage')
      .select('cost_micros, key_source')
      .in('key_source', ['MASTER_TRIAL', 'MASTER_PLAN', 'MASTER_ADMIN'])
      .gte('created_at', midnight.toISOString()),
    admin.from('usage').select('outcome').gte('created_at', since),
    // Today's and yesterday's rows: what broke in browsers, counted (migration 0015).
    admin.from('client_errors').select('count, message, route, version, kind').gte('day', yesterday),
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
          : { spentTodayMicros: spentMicros, ceilingMicros, planSpentTodayMicros: planSpentMicros, planCeilingMicros, outcomes },
      clientErrors,
    },
    ok ? 200 : 503,
  )
})
