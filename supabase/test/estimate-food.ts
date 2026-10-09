/**
 * estimate-food, run for real against a stand-in database and a fake OpenAI.
 *
 * The money path: who is charged an analysis, who is refused before anything
 * is spent, what the ledger records, and which model and which key reach the
 * provider. Every scenario asserts both sides — what was sent to OpenAI (or
 * that nothing was) and what the ledger holds afterwards — because a handler
 * that answers correctly while booking the wrong cost is the bug that matters.
 *
 * The stand-in implements `reserve_analysis` and `settle_analysis` with the
 * semantics their migrations define (0011, 0012): a claim counts against the
 * allowance while RESERVED, settling writes the outcome and the cost. Their
 * locking and expiry are proved against real Postgres by db:verify and the
 * race test; this file is about the handler's use of them.
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/estimate-food.ts
 */
import {
  ASSUMED_ANALYSIS_MICROS,
  MAX_FOLLOW_UPS,
  MODEL_LUNA,
  MODEL_SOL,
  TRIAL_ANALYSES,
  TRIAL_MODEL,
  costMicros,
} from '../functions/_shared/prompt.ts'
import { PLAN_ALLOWANCE, type SubscriptionRow } from '../functions/_shared/plan.ts'

Deno.env.set('SUPABASE_URL', 'http://localhost:8997')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-key')
Deno.env.set('SUPABASE_ANON_KEY', 'stub-anon-key')
const TRIAL_KEY = 'sk-trial-key-for-tests'
const ADMIN_KEY = 'sk-admin-key-for-tests'
const PLAN_KEY = 'sk-plan-key-for-tests'

const USER = '11111111-1111-4111-8111-111111111111'
const ADMIN = '22222222-2222-4222-8222-222222222222'
const DAY = '2026-10-09'
const IN_TOKENS = 1000
const OUT_TOKENS = 200

// ------------------------------------------------------------ the database --

interface Row {
  id: string
  user_id: string
  day: string
  conversation_id: string | null
  model: string
  key_source: string
  outcome: string
  input_tokens: number | null
  output_tokens: number | null
  cost_micros: number | null
  created_at: string
  kind: string
}

let usage: Row[] = []
let subscriptions: SubscriptionRow[] = []
let admins: string[] = []
let failSpendRead = false
const rpcCalls: string[] = []

const row = (fields: Partial<Row>): Row => ({
  id: crypto.randomUUID(),
  user_id: USER,
  day: DAY,
  conversation_id: null,
  model: MODEL_SOL,
  key_source: 'MASTER_TRIAL',
  outcome: 'OK',
  input_tokens: null,
  output_tokens: null,
  cost_micros: null,
  created_at: new Date().toISOString(),
  kind: 'PHOTO',
  ...fields,
})

/** PostgREST's eq / in / gte, as supabase-js writes them. */
function matches(r: Row, params: URLSearchParams): boolean {
  for (const [column, filter] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(column)) continue
    const value = String((r as unknown as Record<string, unknown>)[column] ?? '')
    if (filter.startsWith('eq.') && value !== filter.slice(3)) return false
    if (filter.startsWith('gte.') && value < filter.slice(4)) return false
    if (filter.startsWith('in.(')) {
      const options = filter.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''))
      if (!options.includes(value)) return false
    }
  }
  return true
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

const stub = Deno.serve({ port: 8997, onListen: () => {} }, async (req) => {
  const url = new URL(req.url)
  const path = url.pathname

  if (path === '/auth/v1/user') {
    const auth = req.headers.get('authorization') ?? ''
    if (auth === 'Bearer user-token') return json({ id: USER, aud: 'authenticated', role: 'authenticated' })
    if (auth === 'Bearer admin-token') return json({ id: ADMIN, aud: 'authenticated', role: 'authenticated' })
    return json({ code: 401, msg: 'invalid JWT' }, 401)
  }

  if (path === '/rest/v1/app_admins') {
    const userId = url.searchParams.get('user_id')?.slice(3)
    return json(admins.includes(userId ?? '') ? [{ user_id: userId }] : [])
  }

  if (path === '/rest/v1/subscriptions') {
    return json(subscriptions.filter((r) => matches(r as unknown as Row, url.searchParams)))
  }

  if (path === '/rest/v1/usage') {
    if (req.method === 'POST') {
      const body = await req.json()
      for (const fields of Array.isArray(body) ? body : [body]) usage.push(row(fields))
      return json(undefined, 201)
    }
    if (failSpendRead && url.searchParams.has('key_source') && url.searchParams.has('created_at')) {
      return json({ message: 'ledger down' }, 500)
    }
    const found = usage.filter((r) => matches(r, url.searchParams))
    if (req.method === 'HEAD') return json(undefined, 200, { 'content-range': `*/${found.length}` })
    return json(found)
  }

  if (path === '/rest/v1/rpc/reserve_analysis') {
    rpcCalls.push('reserve')
    const a = await req.json()
    // As migration 0014: only OK and in-flight claims count; per kind, and from the period start, when asked.
    const taken = usage.filter(
      (r) => r.user_id === a.p_user_id && r.key_source === a.p_key_source &&
        (!a.p_period_start || r.created_at >= a.p_period_start) &&
        (!a.p_per_kind || r.kind === a.p_kind) &&
        (r.outcome === 'OK' || r.outcome === 'RESERVED'),
    ).length
    if (taken >= a.p_limit) return json(null)
    const claim = row({
      user_id: a.p_user_id,
      day: a.p_day,
      model: a.p_model,
      key_source: a.p_key_source,
      outcome: 'RESERVED',
      conversation_id: a.p_conversation,
      kind: a.p_kind ?? 'PHOTO',
    })
    usage.push(claim)
    return json(claim.id)
  }

  if (path === '/rest/v1/rpc/settle_analysis') {
    rpcCalls.push('settle')
    const a = await req.json()
    const claim = usage.find((r) => r.id === a.p_id && r.outcome === 'RESERVED')
    if (!claim) return json(null)
    Object.assign(claim, {
      model: a.p_model,
      outcome: a.p_outcome,
      input_tokens: a.p_input_tokens,
      output_tokens: a.p_output_tokens,
      cost_micros: a.p_cost_micros,
    })
    return json(claim.outcome)
  }

  return json({ message: `not stubbed: ${req.method} ${path}` }, 404)
})

// --------------------------------------------------------------- OpenAI ---

type ProviderMode = 'ok' | 'error500' | 'quota429' | 'throw' | 'empty'
let provider: ProviderMode = 'ok'
let providerCalls: { model: string; key: string; messages: { role: string; content: unknown }[] }[] = []

const realFetch = globalThis.fetch
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith('https://api.openai.com/')) return realFetch(input, init)

  const body = JSON.parse(String(init?.body))
  providerCalls.push({
    model: body.model,
    key: new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '',
    messages: body.messages,
  })
  if (provider === 'throw') throw new TypeError('network down')
  if (provider === 'error500') {
    return new Response('{"error":{"message":"internal error on account org-OWNER"}}', { status: 500 })
  }
  if (provider === 'quota429') {
    return new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 })
  }
  return Response.json({
    choices: [{ message: { content: provider === 'empty' ? '' : '{"items":[],"overallConfidence":0.8}' } }],
    usage: { prompt_tokens: IN_TOKENS, completion_tokens: OUT_TOKENS },
  })
}

await import('../functions/estimate-food/index.ts')

// ------------------------------------------------------------ scenarios ---

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failed++
}

function reset(env: Record<string, string | undefined> = {}) {
  usage = []
  subscriptions = []
  admins = []
  failSpendRead = false
  rpcCalls.length = 0
  provider = 'ok'
  providerCalls = []
  const defaults: Record<string, string | undefined> = {
    OPENAI_TRIAL_KEY: TRIAL_KEY,
    OPENAI_ADMIN_KEY: ADMIN_KEY,
    OPENAI_MASTER_KEY: undefined,
    OPENAI_PLAN_KEY: PLAN_KEY,
    DAILY_BUDGET_MICROS: undefined,
    PLAN_DAILY_BUDGET_MICROS: undefined,
  }
  for (const [name, value] of Object.entries({ ...defaults, ...env })) {
    if (value === undefined) Deno.env.delete(name)
    else Deno.env.set(name, value)
  }
}

async function call(body: Record<string, unknown>, token = 'user-token') {
  const response = await fetch('http://localhost:8000/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(text)
  } catch { /* keep {} */ }
  return { status: response.status, body: parsed, text }
}

const meal = (extra: Record<string, unknown> = {}) => ({ text: 'one medium banana', day: DAY, ...extra })
const outcomes = () => usage.map((r) => r.outcome).sort().join(',')

console.log('\nWho may ask')
{
  reset()
  const r = await call(meal(), 'not-a-token')
  check('an unknown caller is refused', r.status === 401 && r.body.error === 'not_signed_in', String(r.status))
  check('and nothing is sent or recorded', providerCalls.length === 0 && usage.length === 0)
}
{
  reset()
  const r = await call({ day: DAY })
  check('a request with nothing to analyse is refused', r.status === 400, String(r.status))
  check('and nothing is spent', providerCalls.length === 0 && usage.length === 0)
}

console.log('\nAn ordinary trial analysis')
{
  reset()
  const r = await call(meal({ conversationId: 'conv-1' }))
  const [settled] = usage
  check('succeeds', r.status === 200 && typeof r.body.content === 'string', String(r.status))
  check('claims a slot, then settles that same claim', rpcCalls.join() === 'reserve,settle', rpcCalls.join())
  check('leaves exactly one ledger row, OK', usage.length === 1 && settled.outcome === 'OK', outcomes())
  check('books the measured cost', settled.cost_micros === costMicros(TRIAL_MODEL, IN_TOKENS, OUT_TOKENS),
    `${settled.cost_micros} vs ${costMicros(TRIAL_MODEL, IN_TOKENS, OUT_TOKENS)}`)
  check('on the trial key and the default model', providerCalls[0]?.key === TRIAL_KEY && providerCalls[0]?.model === TRIAL_MODEL,
    `${providerCalls[0]?.model}`)
  check('reports the count after this one', (r.body.trial as { used: number })?.used === 1,
    JSON.stringify(r.body.trial))
}

console.log('\nThe trial wall')
{
  reset()
  for (let i = 0; i < TRIAL_ANALYSES; i++) usage.push(row({ outcome: 'OK', cost_micros: 1000 }))
  const r = await call(meal())
  check(`the ${TRIAL_ANALYSES + 1}th analysis is refused`, r.status === 402 && r.body.error === 'trial_exhausted',
    String(r.status))
  check('before anything reaches OpenAI', providerCalls.length === 0)
  check('and the refusal is recorded, not charged', usage.filter((x) => x.outcome === 'REFUSED_QUOTA').length === 1 &&
    usage.filter((x) => x.outcome === 'OK').length === TRIAL_ANALYSES, outcomes())
}
{
  reset()
  for (let i = 0; i < TRIAL_ANALYSES - 1; i++) usage.push(row({ outcome: 'OK' }))
  usage.push(row({ outcome: 'RESERVED' }))
  const r = await call(meal())
  check('an in-flight claim counts too — the last slot cannot be taken twice', r.status === 402,
    String(r.status))
}

console.log('\nThe daily spend ceiling')
{
  reset({ DAILY_BUDGET_MICROS: '200000' })
  usage.push(row({ user_id: 'someone-else', outcome: 'OK', cost_micros: 150_000 }))
  usage.push(row({ user_id: 'someone-else', outcome: 'RESERVED' })) // counted at the assumed cost
  const r = await call(meal())
  check('stops everyone once the day is spent', r.status === 503 && r.body.error === 'service_at_capacity',
    String(r.status))
  check('counting what is still in flight at the assumed cost',
    150_000 + ASSUMED_ANALYSIS_MICROS >= 200_000 && providerCalls.length === 0)
  check('records REFUSED_BUDGET and claims nothing',
    usage.some((x) => x.outcome === 'REFUSED_BUDGET') && !rpcCalls.includes('reserve'), outcomes())
}
{
  reset()
  failSpendRead = true
  const r = await call(meal())
  check('fails CLOSED when the ledger cannot be read', r.status === 503 && r.body.error === 'ledger_unavailable',
    String(r.status))
  check('so nothing is spent blind', providerCalls.length === 0)
}

console.log('\nFollow-up questions')
{
  reset()
  usage.push(row({ outcome: 'OK', conversation_id: 'conv-1', cost_micros: 5000 }))
  const r = await call(meal({ conversationId: 'conv-1', answers: [{ question: 'Fried?', answer: 'Grilled' }] }))
  check('an answer in a paid conversation is free', r.status === 200 && r.body.followUp === true, String(r.status))
  check('claims no slot', !rpcCalls.includes('reserve'), rpcCalls.join())
  check('records OK_FOLLOWUP, with its real cost', usage.some((x) => x.outcome === 'OK_FOLLOWUP' &&
    x.cost_micros === costMicros(TRIAL_MODEL, IN_TOKENS, OUT_TOKENS)), outcomes())
  check('and the trial count does not move', (r.body.trial as { used: number })?.used === 1,
    JSON.stringify(r.body.trial))
  check('the answer reaches the model', JSON.stringify(providerCalls[0]?.messages).includes('Grilled'))
}
{
  reset()
  const r = await call(meal({ conversationId: 'made-up', answers: [{ question: 'Fried?', answer: 'No' }] }))
  check('a "follow-up" to a conversation that never happened is charged', r.status === 200 &&
    r.body.followUp === false && rpcCalls.includes('reserve') && usage.some((x) => x.outcome === 'OK'), outcomes())
}
{
  reset()
  usage.push(row({ outcome: 'OK', conversation_id: 'conv-1' }))
  for (let i = 0; i < MAX_FOLLOW_UPS; i++) usage.push(row({ outcome: 'OK_FOLLOWUP', conversation_id: 'conv-1' }))
  const r = await call(meal({ conversationId: 'conv-1', answers: [{ question: 'More?', answer: 'Yes' }] }))
  check(`past ${MAX_FOLLOW_UPS} free answers, the next is charged — never refused`,
    r.status === 200 && r.body.followUp === false && rpcCalls.includes('reserve'), outcomes())
}

console.log('\nThe model choice')
{
  reset()
  // Nine on the best model already: the tenth may still be on it — no separate budget.
  for (let i = 0; i < TRIAL_ANALYSES - 1; i++) usage.push(row({ outcome: 'OK', model: MODEL_SOL }))
  const r = await call(meal({ model: MODEL_SOL }))
  check('the best model runs every analysis of the trial', r.status === 200 &&
    providerCalls[0]?.model === MODEL_SOL && r.body.model === MODEL_SOL, providerCalls[0]?.model)
}
{
  reset()
  const r = await call(meal({ model: MODEL_LUNA }))
  check('the faster model runs when asked for', r.status === 200 && providerCalls[0]?.model === MODEL_LUNA,
    providerCalls[0]?.model)
  check('booked at its own prices', usage.some((x) => x.outcome === 'OK' && x.model === MODEL_LUNA &&
    x.cost_micros === costMicros(MODEL_LUNA, IN_TOKENS, OUT_TOKENS)), outcomes())
}
for (const retired of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-astra', 'gpt-made-up-and-expensive']) {
  reset()
  const r = await call(meal({ model: retired }))
  check(`${retired}, not offered, runs on the default instead`, r.status === 200 &&
    providerCalls[0]?.model === TRIAL_MODEL, providerCalls[0]?.model)
}

console.log('\nWhen the provider fails')
{
  reset()
  provider = 'error500'
  const r = await call(meal())
  check('a provider error is a 502', r.status === 502 && r.body.error === 'provider_error', String(r.status))
  check('that never relays the provider’s own message', !r.text.includes('org-OWNER'), r.text)
  check('gives the slot back — the row is PROVIDER_ERROR, not OK', outcomes() === 'PROVIDER_ERROR', outcomes())
  check('but keeps the cost, at the assumed amount', usage[0]?.cost_micros === ASSUMED_ANALYSIS_MICROS,
    String(usage[0]?.cost_micros))
}
{
  reset()
  provider = 'quota429'
  const r = await call(meal())
  check('the owner’s quota running out is named as such', r.status === 503 &&
    r.body.error === 'free_analysis_unavailable', String(r.status))
  check('and costs the user nothing', outcomes() === 'PROVIDER_ERROR', outcomes())
}
{
  reset()
  provider = 'throw'
  const r = await call(meal())
  check('an unreachable provider is a 502 and the slot comes back', r.status === 502 &&
    outcomes() === 'PROVIDER_ERROR', `${r.status} ${outcomes()}`)
}
{
  reset()
  provider = 'empty'
  const r = await call(meal())
  check('an empty reply is UNREADABLE, booked at its measured cost', r.status === 502 &&
    outcomes() === 'UNREADABLE' && usage[0]?.cost_micros === costMicros(TRIAL_MODEL, IN_TOKENS, OUT_TOKENS),
    `${r.status} ${outcomes()} ${usage[0]?.cost_micros}`)
}

console.log('\nAdmins and configuration')
{
  reset()
  admins = [ADMIN]
  for (let i = 0; i < TRIAL_ANALYSES; i++) usage.push(row({ user_id: ADMIN, outcome: 'OK' }))
  const r = await call(meal({ model: MODEL_LUNA }), 'admin-token')
  check('an admin is never walled', r.status === 200, String(r.status))
  check('analyses on the admin key, with the model asked for', providerCalls[0]?.key === ADMIN_KEY &&
    providerCalls[0]?.model === MODEL_LUNA, `${providerCalls[0]?.model}`)
  check('records MASTER_ADMIN without claiming a slot', !rpcCalls.includes('reserve') &&
    usage.some((x) => x.user_id === ADMIN && x.key_source === 'MASTER_ADMIN' && x.outcome === 'OK'), outcomes())
  check('and reports no allowance', r.body.trial === undefined)
}
{
  reset({ OPENAI_TRIAL_KEY: undefined, OPENAI_ADMIN_KEY: undefined })
  const r = await call(meal())
  check('no key configured is the owner’s problem, said plainly', r.status === 503 &&
    r.body.error === 'master_key_missing', String(r.status))
  check('recorded, and nothing sent', providerCalls.length === 0 && outcomes() === 'REFUSED_NO_KEY', outcomes())
}
{
  reset({ OPENAI_TRIAL_KEY: undefined, OPENAI_MASTER_KEY: TRIAL_KEY })
  const r = await call(meal())
  check('the older OPENAI_MASTER_KEY name still works', r.status === 200 && providerCalls[0]?.key === TRIAL_KEY,
    String(r.status))
}

console.log('\nA subscriber')

const DAY_MS = 86_400_000
/** An active subscription billed on today's date: this month began at midnight UTC today. */
const subscribed = (fields: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 'sub-1',
  user_id: USER,
  status: 'active',
  billing_anchor: new Date().getUTCDate(),
  renews_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
  ends_at: null,
  refunded_at: null,
  last_payment_at: new Date().toISOString(),
  source_created_at: new Date(Date.now() - 40 * DAY_MS).toISOString(),
  ...fields,
})
const monthStart = () => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}
const photo = (extra: Record<string, unknown> = {}) =>
  ({ photo: 'data:image/jpeg;base64,AAAA', day: DAY, ...extra })
const fill = (n: number, fields: Partial<Row>) => {
  for (let i = 0; i < n; i++) usage.push(row({ key_source: 'MASTER_PLAN', outcome: 'OK', ...fields }))
}
{
  reset()
  subscriptions = [subscribed()]
  for (let i = 0; i < TRIAL_ANALYSES; i++) usage.push(row({ outcome: 'OK' })) // the trial is long gone
  const r = await call(photo())
  check('is analysed although the trial is spent', r.status === 200, String(r.status))
  check('on the plan key, booked as MASTER_PLAN', providerCalls[0]?.key === PLAN_KEY &&
    usage.some((x) => x.key_source === 'MASTER_PLAN' && x.outcome === 'OK' && x.kind === 'PHOTO'), outcomes())
  const plan = r.body.plan as Record<string, unknown> | undefined
  check('the reply reports the month, not the trial', r.body.trial === undefined && plan?.kind === 'PHOTO' &&
    plan?.used === 1 && plan?.allowance === PLAN_ALLOWANCE.PHOTO && plan?.renews === true, JSON.stringify(r.body))
}
{
  reset()
  subscriptions = [subscribed()]
  fill(PLAN_ALLOWANCE.PHOTO - 1, { kind: 'PHOTO' })
  const last = await call(photo())
  check(`photo ${PLAN_ALLOWANCE.PHOTO} of ${PLAN_ALLOWANCE.PHOTO} is allowed`, last.status === 200, String(last.status))
  providerCalls = []
  const over = await call(photo())
  check('the next is refused as the plan, with when it resets', over.status === 402 &&
    over.body.error === 'plan_exhausted' && over.body.kind === 'PHOTO' && typeof over.body.resetsAt === 'string',
    JSON.stringify(over.body))
  check('nothing sent, REFUSED_QUOTA recorded on the plan', providerCalls.length === 0 &&
    usage.some((x) => x.outcome === 'REFUSED_QUOTA' && x.key_source === 'MASTER_PLAN'))
  const words = await call(meal())
  check('while written analyses have their own allowance', words.status === 200 &&
    (words.body.plan as Record<string, unknown>)?.kind === 'TEXT' &&
    (words.body.plan as Record<string, unknown>)?.allowance === PLAN_ALLOWANCE.TEXT, JSON.stringify(words.body))
}
{
  reset()
  subscriptions = [subscribed()]
  fill(PLAN_ALLOWANCE.TEXT, { kind: 'TEXT' })
  const r = await call(meal())
  check(`the ${PLAN_ALLOWANCE.TEXT + 1}st description is refused`, r.status === 402 &&
    r.body.error === 'plan_exhausted' && r.body.kind === 'TEXT', JSON.stringify(r.body))
}
{
  reset()
  subscriptions = [subscribed()]
  // Last month's hundred, a second before this month began.
  fill(PLAN_ALLOWANCE.PHOTO, { kind: 'PHOTO', created_at: new Date(Date.parse(monthStart()) - 1000).toISOString() })
  const r = await call(photo())
  check('a new month starts from zero', r.status === 200, String(r.status))
}
{
  reset()
  subscriptions = [subscribed()]
  fill(PLAN_ALLOWANCE.PHOTO - 1, { kind: 'PHOTO' })
  fill(5, { kind: 'PHOTO', outcome: 'OK_FOLLOWUP' })
  const r = await call(photo())
  check('answered questions do not use up the allowance', r.status === 200, String(r.status))
}
{
  reset()
  subscriptions = [subscribed()]
  fill(1, { kind: 'PHOTO', conversation_id: 'conv-p' })
  const r = await call(photo({ conversationId: 'conv-p', answers: [{ question: 'Fried?', answer: 'No' }] }))
  check('a follow-up is free on the plan too', r.status === 200 && !rpcCalls.includes('reserve') &&
    (r.body.plan as Record<string, unknown>)?.used === 1, JSON.stringify(r.body.plan))
}
{
  reset()
  subscriptions = [subscribed({ status: 'cancelled', ends_at: new Date(Date.now() + 5 * DAY_MS).toISOString() })]
  const r = await call(photo())
  check('cancelled: still analysed until the paid month ends', r.status === 200 &&
    providerCalls[0]?.key === PLAN_KEY && (r.body.plan as Record<string, unknown>)?.renews === false,
    JSON.stringify(r.body.plan))
}
{
  reset()
  subscriptions = [subscribed({ status: 'cancelled', ends_at: new Date(Date.now() - 1000).toISOString() })]
  for (let i = 0; i < TRIAL_ANALYSES; i++) usage.push(row({ outcome: 'OK' }))
  const r = await call(photo())
  check('…and refused once it has', r.status === 402 && r.body.error === 'trial_exhausted', JSON.stringify(r.body))
}
for (const status of ['expired', 'unpaid', 'paused']) {
  reset()
  subscriptions = [subscribed({ status })]
  for (let i = 0; i < TRIAL_ANALYSES; i++) usage.push(row({ outcome: 'OK' }))
  const r = await call(photo())
  check(`${status}: no paid analyses`, r.status === 402 && r.body.error === 'trial_exhausted', String(r.status))
}
{
  reset()
  subscriptions = [subscribed({
    last_payment_at: new Date(Date.now() - DAY_MS).toISOString(),
    refunded_at: new Date().toISOString(),
  })]
  for (let i = 0; i < TRIAL_ANALYSES; i++) usage.push(row({ outcome: 'OK' }))
  const r = await call(photo())
  check('refunded: access ends at once, even while still "active"', r.status === 402 &&
    r.body.error === 'trial_exhausted' && providerCalls.length === 0, String(r.status))
}
{
  reset({ DAILY_BUDGET_MICROS: '200000' })
  subscriptions = [subscribed()]
  usage.push(row({ user_id: 'someone-else', outcome: 'OK', cost_micros: 5_000_000 })) // trials spent the day
  const r = await call(photo())
  check('a busy trial day does not turn a subscriber away', r.status === 200, String(r.status))
}
{
  reset({ PLAN_DAILY_BUDGET_MICROS: '200000' })
  subscriptions = [subscribed()]
  usage.push(row({ user_id: 'someone-else', key_source: 'MASTER_PLAN', outcome: 'OK', cost_micros: 250_000 }))
  const r = await call(photo())
  check('but the plan has a ceiling of its own', r.status === 503 && r.body.error === 'service_at_capacity',
    String(r.status))
}
{
  reset({ OPENAI_PLAN_KEY: undefined })
  subscriptions = [subscribed()]
  const r = await call(photo())
  check('with no plan key yet, subscribers use the trial key', r.status === 200 && providerCalls[0]?.key === TRIAL_KEY,
    String(r.status))
}

await stub.shutdown()
console.log(failed === 0 ? '\nestimate-food: all checks passed' : `\nestimate-food: ${failed} failed`)
Deno.exit(failed === 0 ? 0 : 1)
