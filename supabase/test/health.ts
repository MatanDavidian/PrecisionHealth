/**
 * The health function, run for real against a stand-in PostgREST.
 *
 * What matters: it refuses anyone without the token, it says exactly what is
 * missing when something is, it counts the last day without leaking a row,
 * and it never echoes a secret back.
 *
 *   deno run --allow-net --allow-env supabase/test/health.ts
 */
import { google, resetGoogle, serviceAccount } from './_stub.ts'

const TOKEN = 'health-token-for-tests-only-0123456789'
Deno.env.set('SUPABASE_URL', 'http://localhost:8998')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-key')
Deno.env.set('SUPABASE_ANON_KEY', 'stub-anon-key')
Deno.env.set('OPENAI_TRIAL_KEY', 'sk-stub-never-echoed')

let schemaMissing: string[] = []
let remindersScheduled = true
let errorsDown = false
let disputes: Record<string, string>[] = []
let playEvents: Record<string, string>[] = []

const stub = Deno.serve({ port: 8998, onListen: () => {} }, (req) => {
  const url = new URL(req.url)
  if (url.pathname === '/rest/v1/rpc/health_missing') return Response.json(schemaMissing)
  if (url.pathname === '/rest/v1/rpc/reminders_scheduled') return Response.json(remindersScheduled)
  if (url.pathname === '/rest/v1/usage') {
    // Two reads: the day's spend (cost_micros) and the last 24h (outcome).
    return url.searchParams.get('select')?.startsWith('cost_micros')
      ? Response.json([
        { cost_micros: 1200, key_source: 'MASTER_TRIAL' },
        { cost_micros: 800, key_source: 'MASTER_ADMIN' },
        { cost_micros: null, key_source: 'MASTER_TRIAL' },
        { cost_micros: 5000, key_source: 'MASTER_PLAN' },
      ])
      : Response.json([{ outcome: 'OK' }, { outcome: 'OK' }, { outcome: 'PROVIDER_ERROR' }])
  }
  if (url.pathname === '/rest/v1/billing_events') {
    // Two reads: the newest Google Play notification, and the month's disputes.
    return url.searchParams.has('object_type')
      ? Response.json(playEvents)
      : Response.json(disputes)
  }
  if (url.pathname === '/rest/v1/ai_reports') {
    return Response.json([{ reason: 'wrong' }, { reason: 'offensive' }, { reason: 'wrong' }])
  }
  if (url.pathname === '/rest/v1/client_errors') {
    if (errorsDown) return Response.json({ message: 'down' }, { status: 500 })
    return Response.json([
      { count: 3, kind: 'error', message: 'x is undefined', route: '/log', version: 'abcdef0123456' },
      { count: 9, kind: 'render', message: 'Cannot read properties of null', route: '/today', version: 'abcdef0123456' },
    ])
  }
  return Response.json({ message: 'not stubbed' }, { status: 404 })
})

// OpenAI, faked at fetch: a key in `cannotRun` is refused that model, as a
// project without access to it is.
const cannotRun = new Map<string, string>()
const probed: { key: string; model: string }[] = []
const realFetch = globalThis.fetch
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!href.startsWith('https://api.openai.com/')) return realFetch(input, init)
  const key = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? ''
  const model = JSON.parse(String(init?.body)).model
  probed.push({ key, model })
  if (cannotRun.get(key) === model) {
    return new Response(JSON.stringify({ error: {
      message: `The model ${model} does not exist or you do not have access to it. ${key}`,
      code: 'model_not_found',
    } }), { status: 404 })
  }
  return Response.json({ choices: [{ message: { content: 'ok' } }] })
}

await import('../functions/health/index.ts')

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failed++
}
const call = (token?: string) =>
  fetch('http://localhost:8000/', { headers: token ? { 'x-health-token': token } : {} })

{
  Deno.env.delete('HEALTH_TOKEN')
  const res = await call(TOKEN)
  check('without a configured token it refuses to run', res.status === 503, String(res.status))
  await res.body?.cancel()
  Deno.env.set('HEALTH_TOKEN', TOKEN)
}
{
  const res = await call('wrong')
  const text = await res.text()
  check('a wrong token is refused', res.status === 401, String(res.status))
  check('and told nothing', !text.includes('schema') && !text.includes('last24h'), text)
}
{
  const res = await call()
  check('no token is refused', res.status === 401, String(res.status))
  await res.body?.cancel()
}
{
  schemaMissing = []
  const res = await call(TOKEN)
  const text = await res.text()
  const body = JSON.parse(text)
  check('healthy is 200 and ok', res.status === 200 && body.ok === true, text.slice(0, 120))
  check('it says which version answered', res.headers.get('x-vimetry-version') === body.version, body.version)
  check('the day is summed against the trials’ ceiling', body.last24h.spentTodayMicros === 2000,
    String(body.last24h.spentTodayMicros))
  check('and subscribers against their own', body.last24h.planSpentTodayMicros === 5000 &&
    body.last24h.planCeilingMicros === 50_000_000, JSON.stringify(body.last24h))
  check('browser errors are counted, worst first', body.clientErrors.total === 12 && body.clientErrors.distinct === 2 &&
    body.clientErrors.top[0].count === 9 && body.clientErrors.top[0].version === 'abcdef0', JSON.stringify(body.clientErrors))
  check('reported AI answers are counted by reason', body.aiReports.last24h.wrong === 2 &&
    body.aiReports.last24h.offensive === 1, JSON.stringify(body.aiReports))
  check('outcomes are counted', body.last24h.outcomes.OK === 2 && body.last24h.outcomes.PROVIDER_ERROR === 1,
    JSON.stringify(body.last24h.outcomes))
  check('no secret is echoed', !text.includes('sk-stub') && !text.includes('stub-service-key') && !text.includes(TOKEN))
  check('payments not connected is said, not failed', body.billing.configured === false && res.status === 200)
  check('Google Play not connected is said, not failed, and Google is not asked',
    body.play.configured === false && res.status === 200 && google.calls.length === 0, JSON.stringify(body.play))
}
{
  schemaMissing = ['function reserve_analysis', 'outcome SETTLED_LATE']
  const res = await call(TOKEN)
  const body = await res.json()
  check('a missing migration is 503 — the 25 Sep outage', res.status === 503 && body.ok === false, String(res.status))
  check('and names what is missing', JSON.stringify(body.schema.missing) === JSON.stringify(schemaMissing),
    JSON.stringify(body.schema.missing))
  schemaMissing = []
}
{
  remindersScheduled = false
  const res = await call(TOKEN)
  const body = await res.json()
  check('a reminders schedule that was never created is said, as a missing piece', res.status === 503 &&
    JSON.stringify(body.schema.missing) === JSON.stringify(['reminders schedule (cron job send-reminders)']),
    JSON.stringify(body.schema.missing))
  remindersScheduled = true
}
{
  Deno.env.delete('OPENAI_TRIAL_KEY')
  const res = await call(TOKEN)
  const body = await res.json()
  check('a missing OpenAI key is 503', res.status === 503, String(res.status))
  check('and named, not shown', body.secrets.missing[0] === 'OPENAI_TRIAL_KEY or OPENAI_MASTER_KEY', JSON.stringify(body.secrets))
  Deno.env.set('OPENAI_MASTER_KEY', 'sk-older-name')
  const fallback = await call(TOKEN)
  check('the older OPENAI_MASTER_KEY still counts', fallback.status === 200, String(fallback.status))
  await fallback.body?.cancel()
}

{
  disputes = [{ event_name: 'dispute_created', object_id: '4723042', received_at: '2026-10-10T18:00:00Z' }]
  const res = await call(TOKEN)
  const body = await res.json()
  check('a payment dispute is reported, without failing the service', res.status === 200 &&
    body.disputes.last30days.length === 1 && body.disputes.last30days[0].object_id === '4723042',
    JSON.stringify(body.disputes))
  disputes = []
}
{
  errorsDown = true
  const res = await call(TOKEN)
  const body = await res.json()
  check('an unreadable error table is said, without failing the rest', res.status === 200 &&
    body.clientErrors.error === 'client_errors unreadable', JSON.stringify(body.clientErrors))
  errorsDown = false
}

{
  // A Lemon Squeezy key is a JWT; only its expiry may come back.
  const exp = Math.floor(Date.parse('2027-04-10T00:00:00Z') / 1000)
  const key = `eyJhbGciOiJSUzI1NiJ9.${btoa(JSON.stringify({ sub: '1', exp })).replace(/=+$/, '')}.signature-part`
  for (const [name, value] of Object.entries({
    LEMONSQUEEZY_API_KEY: key, LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec', LEMONSQUEEZY_STORE_ID: '1',
    LEMONSQUEEZY_VARIANT_ID: '2', LEMONSQUEEZY_TEST_MODE: '1',
  })) Deno.env.set(name, value)
  const res = await call(TOKEN)
  const text = await res.text()
  const body = JSON.parse(text)
  check('reports when the payments API key expires', body.billing.configured === true && body.billing.testMode === true &&
    body.billing.apiKeyExpiresAt === '2027-04-10T00:00:00.000Z', JSON.stringify(body.billing))
  check('and never the key itself', !text.includes('signature-part') && !text.includes('whsec'))
}

{
  probed.length = 0
  Deno.env.set('OPENAI_PLANS_KEY', 'sk-plans-stub')
  Deno.env.set('OPENAI_ADMIN_KEY', 'sk-admin-stub')
  cannotRun.set('sk-plans-stub', 'gpt-6.1-sol')
  const res = await call(TOKEN)
  const text = await res.text()
  const body = JSON.parse(text)
  check('every key is tried against every offered model', probed.length === 9, JSON.stringify(probed))
  const failing = body.openai.filter((p: { ok: boolean }) => !p.ok)
  check('a key that cannot run a model fails the check, naming key, model and code', res.status === 503 &&
    failing.length === 1 && failing[0].key === 'plans' && failing[0].model === 'gpt-6.1-sol' &&
    failing[0].code === 'model_not_found' && failing[0].status === 404, JSON.stringify(failing))
  check('without echoing a key or the provider’s message', !text.includes('sk-plans-stub') &&
    !text.includes('does not exist'))
  cannotRun.clear()
  Deno.env.set('OPENAI_ADMIN_KEY', 'sk-plans-stub')
  probed.length = 0
  const again = await call(TOKEN)
  await again.body?.cancel()
  check('the same key under two names is tried once', probed.length === 6 && again.status === 200,
    `${probed.length} ${again.status}`)
  Deno.env.delete('OPENAI_PLANS_KEY')
  Deno.env.delete('OPENAI_ADMIN_KEY')
}

{
  // Google Play, connected: the service account must be able to read purchases.
  const account = await serviceAccount()
  const RTDN = 'rtdn-token-never-echoed'
  Deno.env.set('GOOGLE_PLAY_SERVICE_ACCOUNT', account)
  Deno.env.set('GOOGLE_PLAY_RTDN_TOKEN', RTDN)
  playEvents = [{ received_at: '2026-11-14T22:58:00Z' }]
  resetGoogle()
  {
    const res = await call(TOKEN)
    const text = await res.text()
    const body = JSON.parse(text)
    check('Google Play connected and readable is healthy', res.status === 200 && body.play.configured === true &&
      body.play.ok === true && body.play.notifications === true, JSON.stringify(body.play))
    check('asked by reading, never by writing', google.calls.length === 1 && google.calls[0].method === 'GET' &&
      google.calls[0].path.endsWith('/purchases/voidedpurchases'), JSON.stringify(google.calls))
    check('and says when Play last sent a notification', body.play.lastNotificationAt === '2026-11-14T22:58:00Z',
      JSON.stringify(body.play))
    check('without echoing the key or the push secret', !text.includes('PRIVATE KEY') && !text.includes(RTDN) &&
      !text.includes(google.issued))
  }
  {
    google.mode = 'forbidden'
    const res = await call(TOKEN)
    const body = await res.json()
    check('Play refusing the service account fails the check, and says so', res.status === 503 &&
      body.play.ok === false && body.play.reason === 'refused' && body.play.status === 403, JSON.stringify(body.play))
    google.mode = 'down'
    const down = await call(TOKEN)
    const downBody = await down.json()
    check('Play not answering fails it as unreachable', down.status === 503 &&
      downBody.play.reason === 'unreachable' && downBody.play.status === 503, JSON.stringify(downBody.play))
    google.mode = 'ok'
  }
  {
    Deno.env.set('GOOGLE_PLAY_SERVICE_ACCOUNT', JSON.stringify({ ...JSON.parse(account), private_key: 'not a key' }))
    const res = await call(TOKEN)
    const body = await res.json()
    check('a key Google will not accept fails it as a bad key', res.status === 503 &&
      body.play.ok === false && body.play.reason === 'bad_key', JSON.stringify(body.play))
    Deno.env.set('GOOGLE_PLAY_SERVICE_ACCOUNT', account)
  }
  {
    Deno.env.delete('GOOGLE_PLAY_RTDN_TOKEN')
    const res = await call(TOKEN)
    const body = await res.json()
    check('without the push secret it fails: renewals and refunds could not arrive', res.status === 503 &&
      body.play.ok === true && body.play.notifications === false, JSON.stringify(body.play))
  }
  Deno.env.delete('GOOGLE_PLAY_SERVICE_ACCOUNT')
  playEvents = []
}

await stub.shutdown()
console.log(failed === 0 ? '\nhealth: all checks passed' : `\nhealth: ${failed} failed`)
Deno.exit(failed === 0 ? 0 : 1)
