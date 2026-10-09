/**
 * lemonsqueezy-webhook, run for real against the stand-in database and a fake
 * Lemon Squeezy.
 *
 * The rules a bug here would break, each asserted on what is stored AND on
 * what the app then grants (`activePlan`, the function estimate-food uses):
 * - only signed events are applied
 * - a redelivery changes nothing
 * - an old event does not undo a newer one
 * - cancelling keeps access to the end of the month
 * - a full refund ends it at once, and stops the billing
 * - a subscription for an account that no longer exists is cancelled
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/lemonsqueezy-webhook.ts
 */
import { call, check, db, finish, lemon, resetDb, resetLemon, startDb, table } from './_stub.ts'
import { sign } from '../functions/_shared/lemonsqueezy.ts'
import { activePlan, type SubscriptionRow } from '../functions/_shared/plan.ts'

const SECRET = 'whsec-for-tests'
const USER = '11111111-1111-4111-8111-111111111111'
const SUB = '9001'
const DAY = 86_400_000
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()

Deno.env.set('SUPABASE_URL', 'http://localhost:8997')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')
Deno.env.set('LEMONSQUEEZY_API_KEY', 'ls-key-for-tests')

const stub = startDb()
await import('../functions/lemonsqueezy-webhook/index.ts')

function reset(env: Record<string, string | undefined> = {}) {
  resetDb()
  resetLemon()
  db.users.add(USER)
  const defaults = { LEMONSQUEEZY_WEBHOOK_SECRET: SECRET, LEMONSQUEEZY_TEST_MODE: '1' }
  for (const [name, value] of Object.entries({ ...defaults, ...env })) {
    if (value === undefined) Deno.env.delete(name)
    else Deno.env.set(name, value)
  }
}

let clock = 0
/** A subscription event, each one later than the last unless told otherwise. */
const subscription = (
  name: string,
  attributes: Record<string, unknown> = {},
  options: { user?: string | null; testMode?: boolean } = {},
) => ({
  meta: {
    event_name: name,
    test_mode: options.testMode ?? true,
    ...(options.user === null ? {} : { custom_data: { user_id: options.user ?? USER } }),
  },
  data: {
    type: 'subscriptions',
    id: SUB,
    attributes: {
      store_id: 1,
      customer_id: 77,
      order_id: 5001,
      variant_id: 42,
      user_name: 'Test Buyer',
      user_email: 'buyer@example.com',
      status: 'active',
      billing_anchor: new Date().getUTCDate(),
      renews_at: at(30),
      ends_at: null,
      created_at: at(-1),
      updated_at: new Date(Date.parse(at(-1)) + ++clock * 1000).toISOString(),
      test_mode: options.testMode ?? true,
      ...attributes,
    },
  },
})

const invoice = (name: string, attributes: Record<string, unknown>) => ({
  meta: { event_name: name, test_mode: true },
  data: {
    type: 'subscription-invoices',
    id: `inv-${++clock}`,
    attributes: { subscription_id: Number(SUB), status: 'paid', refunded: false, refunded_at: null, created_at: at(0), test_mode: true, ...attributes },
  },
})

const order = (attributes: Record<string, unknown>, id = '5001') => ({
  meta: { event_name: 'order_refunded', test_mode: true, custom_data: { user_id: USER } },
  data: { type: 'orders', id, attributes: { status: 'refunded', refunded: true, refunded_at: at(0), test_mode: true, ...attributes } },
})

async function send(event: unknown, signature?: string) {
  const raw = JSON.stringify(event)
  return call(undefined, { raw, headers: { 'X-Signature': signature ?? await sign(SECRET, raw) } })
}

const stored = () => table('subscriptions').find((r) => r.id === SUB) as SubscriptionRow | undefined
const access = () => activePlan(table('subscriptions') as unknown as SubscriptionRow[], new Date())
const deletes = () => lemon.calls.filter((c) => c.method === 'DELETE')

console.log('\nOnly Lemon Squeezy may write')
{
  reset({ LEMONSQUEEZY_WEBHOOK_SECRET: undefined })
  const r = await send(subscription('subscription_created'), 'anything')
  check('no secret configured: refused, nothing stored', r.status === 500 && !stored())
}
{
  reset()
  const r = await send(subscription('subscription_created'), '')
  check('an unsigned event is refused', r.status === 401 && !stored(), String(r.status))
}
{
  reset()
  const r = await send(subscription('subscription_created'), await sign('a-guess', '{}'))
  check('a wrongly signed event is refused', r.status === 401 && !stored(), String(r.status))
}
{
  reset()
  const genuine = JSON.stringify(subscription('subscription_created'))
  const signature = await sign(SECRET, genuine)
  const forged = genuine.replace('"status":"active"', '"status":"active","user_id":"someone"')
  const r = await call(undefined, { raw: forged, headers: { 'X-Signature': signature } })
  check('a signed body that was altered is refused', r.status === 401 && !stored(), String(r.status))
}

console.log('\nSubscribing')
{
  reset()
  const r = await send(subscription('subscription_created'))
  const row = stored()
  check('a new subscription is stored for the account in its custom data', r.status === 200 &&
    r.body.result === 'APPLIED' && row?.user_id === USER && row?.status === 'active', JSON.stringify(r.body))
  check('with what billing needs', row?.billing_anchor === new Date().getUTCDate() &&
    (row as unknown as Record<string, unknown>).order_id === '5001')
  check('and not the buyer’s name or email', !JSON.stringify(row).includes('buyer@example.com') &&
    !JSON.stringify(row).includes('Test Buyer'))
  check('which grants this month, renewing', access()?.renews === true)
}
{
  reset()
  const event = subscription('subscription_created')
  await send(event)
  table('subscriptions')[0].status = 'tampered-by-test'
  const again = await send(event)
  check('a redelivery is recognised and changes nothing', again.status === 200 &&
    again.body.result === 'DUPLICATE' && stored()?.status === 'tampered-by-test', JSON.stringify(again.body))
}
{
  reset()
  const r = await send(subscription('subscription_created', {}, { user: null }))
  check('no account in the event and none on file: not stored', r.body.result === 'UNLINKED' && !stored(),
    JSON.stringify(r.body))
}
{
  reset()
  const r = await send(subscription('subscription_created', {}, { testMode: false }))
  check('a live event while in test mode is ignored', r.body.result === 'IGNORED_MODE' && !stored())
}
{
  reset({ LEMONSQUEEZY_TEST_MODE: undefined })
  const r = await send(subscription('subscription_created'))
  check('and a test purchase never grants access once live', r.body.result === 'IGNORED_MODE' && !stored())
}

console.log('\nCancelling, in order and out of it')
{
  reset()
  await send(subscription('subscription_created'))
  const older = subscription('subscription_updated', { status: 'active' })
  const cancelled = subscription('subscription_cancelled', { status: 'cancelled', ends_at: at(20) }, { user: null })
  const r = await send(cancelled)
  check('cancelled: stored, linked by the row already on file', r.body.result === 'APPLIED' &&
    stored()?.status === 'cancelled' && stored()?.user_id === USER, JSON.stringify(r.body))
  const period = access()
  check('access continues to the end of the paid month', period?.renews === false &&
    Date.parse(period.end) <= Date.parse(at(20)) + 1000, JSON.stringify(period))
  const late = await send(older)
  check('an older event arriving late does not undo it', late.body.result === 'STALE' &&
    stored()?.status === 'cancelled', JSON.stringify(late.body))
}
{
  reset()
  await send(subscription('subscription_created'))
  await send(subscription('subscription_expired', { status: 'expired', ends_at: at(-0.001) }))
  check('expired: no access', stored()?.status === 'expired' && access() === undefined)
  await send(subscription('subscription_resumed', { status: 'active', ends_at: null }))
  check('resumed: access again', access() !== undefined)
}

console.log('\nPayments and refunds')
{
  reset()
  const r = await send(invoice('subscription_payment_success', {}))
  check('an invoice that outruns its subscription is retried, not lost', r.status === 503 &&
    table('billing_events').length === 0, String(r.status))
}
{
  reset()
  await send(subscription('subscription_created'))
  const paidAt = at(-0.5)
  await send(invoice('subscription_payment_success', { created_at: paidAt }))
  check('a payment is recorded', stored()?.last_payment_at === paidAt, String(stored()?.last_payment_at))
  await send(invoice('subscription_payment_success', { created_at: at(-10) }))
  check('and an older one arriving late does not move it back', stored()?.last_payment_at === paidAt)
}
{
  reset()
  await send(subscription('subscription_created'))
  await send(invoice('subscription_payment_success', { created_at: at(-0.5) }))
  const r = await send(invoice('subscription_payment_refunded', {
    status: 'refunded', refunded: true, refunded_at: at(0),
  }))
  check('a full refund is recorded', r.body.result === 'REFUNDED' && Boolean(stored()?.refunded_at),
    JSON.stringify(r.body))
  check('access ends at once, though Lemon Squeezy still says "active"', stored()?.status === 'active' &&
    access() === undefined)
  check('and the subscription is cancelled so it is not charged again', deletes().length === 1 &&
    deletes()[0].path === `/v1/subscriptions/${SUB}` && deletes()[0].key === 'ls-key-for-tests')
}
{
  reset()
  await send(subscription('subscription_created'))
  const r = await send(invoice('subscription_payment_refunded', { status: 'partial_refund', refunded: false }))
  check('a partial refund changes nothing', r.body.result === 'IGNORED' && !stored()?.refunded_at &&
    access() !== undefined && deletes().length === 0, JSON.stringify(r.body))
}
{
  reset()
  await send(subscription('subscription_created'))
  const r = await send(order({}))
  check('refunding the first order (order_refunded) ends access too', r.body.result === 'REFUNDED' &&
    access() === undefined && deletes().length === 1, JSON.stringify(r.body))
}
{
  reset()
  const r = await send(order({}, '9999'))
  check('a refunded order that was never a subscription is left alone', r.body.result === 'NO_SUBSCRIPTION' &&
    deletes().length === 0)
}
{
  reset()
  await send(subscription('subscription_created'))
  lemon.mode = 'error'
  const event = invoice('subscription_payment_refunded', { status: 'refunded', refunded: true, refunded_at: at(0) })
  const r = await send(event)
  check('if the cancel fails, Lemon Squeezy is asked to retry', r.status === 502 && access() === undefined,
    String(r.status))
  lemon.mode = 'ok'
  const retry = await send(event)
  check('and the retry finishes the job', retry.body.result === 'REFUNDED' && deletes().length === 2,
    JSON.stringify(retry.body))
}
{
  reset()
  await send(subscription('subscription_created'))
  await send(subscription('subscription_cancelled', { status: 'cancelled', ends_at: at(20) }))
  await send(invoice('subscription_payment_refunded', { status: 'refunded', refunded: true, refunded_at: at(0) }))
  check('refunding a subscription already cancelled does not cancel it twice', deletes().length === 0 &&
    access() === undefined)
}

console.log('\nAn account that no longer exists')
{
  reset()
  db.users.delete(USER)
  const r = await send(subscription('subscription_created'))
  check('is not given a subscription', r.body.result === 'UNKNOWN_USER' && !stored(), JSON.stringify(r.body))
  check('and the subscription is cancelled, so it stops charging', deletes().length === 1)
}
{
  reset()
  db.users.delete(USER)
  const r = await send(subscription('subscription_cancelled', { status: 'cancelled', ends_at: at(20) }))
  check('one already cancelled (by delete-account) is just noted', r.body.result === 'UNKNOWN_USER' &&
    deletes().length === 0)
}
{
  reset()
  db.users.delete(USER)
  lemon.mode = 'throw'
  const r = await send(subscription('subscription_created'))
  check('and if that cancel fails, it is retried', r.status === 502 && table('billing_events').length === 0,
    String(r.status))
}

console.log('\nEverything else')
{
  reset()
  const r = await send({ meta: { event_name: 'license_key_created', test_mode: true }, data: { type: 'license-keys', id: '1', attributes: {} } })
  check('an event this app does not use is acknowledged and ignored', r.status === 200 && r.body.result === 'IGNORED')
}
{
  reset()
  const response = await fetch('http://localhost:8000/', { method: 'GET' })
  await response.body?.cancel()
  check('only POST', response.status === 405)
}

await stub.shutdown()
finish('lemonsqueezy-webhook')
