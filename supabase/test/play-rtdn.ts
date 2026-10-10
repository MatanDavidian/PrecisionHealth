/**
 * play-rtdn, run for real against the stand-in database and a fake Google.
 *
 * What a bug here would break:
 * - only Google's Pub/Sub (holding the secret) is heard
 * - a notification is a nudge, never the truth: state is re-read from Play
 * - a refund is believed only when Play's voided list confirms it, and then
 *   ends access at once and stops renewal
 * - redeliveries are recognised
 * - anything worth retrying answers 503, unlogged, so it runs again
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/play-rtdn.ts
 */
import {
  call, check, db, finish, google, playPurchase, resetDb, resetGoogle, resetLemon, serviceAccount, startDb, table,
} from './_stub.ts'
import { activePlan, type SubscriptionRow } from '../functions/_shared/plan.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'play-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const SECRET = 'rtdn-secret-for-tests'
const DAY = 86_400_000

Deno.env.set('SUPABASE_URL', 'http://localhost:8997')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')
const SERVICE_ACCOUNT = await serviceAccount()

const stub = startDb()
await import('../functions/play-rtdn/index.ts')

function reset(env: Record<string, string | undefined> = {}) {
  resetDb()
  resetLemon()
  resetGoogle()
  db.users.add(USER)
  const defaults = {
    GOOGLE_PLAY_SERVICE_ACCOUNT: SERVICE_ACCOUNT,
    GOOGLE_PLAY_PACKAGE: 'app.vimetry',
    GOOGLE_PLAY_RTDN_TOKEN: SECRET,
  }
  for (const [name, value] of Object.entries({ ...defaults, ...env })) {
    if (value === undefined) Deno.env.delete(name)
    else Deno.env.set(name, value)
  }
}

/** A row as play-billing stores it, for the account. */
function held(fields: Partial<SubscriptionRow> = {}) {
  table('subscriptions').push({
    id: TOKEN, user_id: USER, provider: 'google_play', status: 'active', billing_anchor: new Date().getUTCDate(),
    renews_at: new Date(Date.now() + 20 * DAY).toISOString(), ends_at: null, refunded_at: null,
    last_payment_at: null, source_created_at: new Date(Date.now() - 10 * DAY).toISOString(), ...fields,
  })
}

let messageId = 0
/** A Pub/Sub push carrying a DeveloperNotification, as Google sends it. */
function push(notification: Record<string, unknown>, options: { secret?: string; id?: string } = {}) {
  const data = btoa(JSON.stringify({
    version: '1.0', packageName: 'app.vimetry', eventTimeMillis: String(Date.now()), ...notification,
  }))
  const target = `http://localhost:8000/?token=${encodeURIComponent(options.secret ?? SECRET)}`
  return fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { data, messageId: options.id ?? `m-${++messageId}` }, subscription: 'projects/p/subscriptions/s' }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
}
const sub = (type: number, token = TOKEN) => ({ subscriptionNotification: { version: '1.0', notificationType: type, purchaseToken: token, subscriptionId: 'vimetry_monthly' } })
const voided = (refundType = 1, token = TOKEN) => ({ voidedPurchaseNotification: { purchaseToken: token, orderId: 'GPA.1', productType: 1, refundType } })

const row = () => table('subscriptions').find((r) => r.id === TOKEN) as SubscriptionRow | undefined
const access = () => activePlan(table('subscriptions') as unknown as SubscriptionRow[], new Date())
const cancels = () => google.calls.filter((c) => c.path.endsWith(':cancel'))

console.log('\nOnly Google is heard')
{
  reset({ GOOGLE_PLAY_RTDN_TOKEN: undefined })
  const r = await push(sub(2))
  check('no secret configured: refused', r.status === 500)
}
{
  reset()
  held()
  const r = await push(sub(13), { secret: 'a-guess' })
  check('a wrong secret is refused, and nothing changes', r.status === 401 && row()?.status === 'active' &&
    google.calls.length === 0)
}
{
  reset()
  const r = await fetch(`http://localhost:8000/?token=${SECRET}`, { method: 'POST', body: 'not json' })
  const body = await r.json()
  check('a malformed push is acknowledged rather than retried for ever', r.status === 200 && body.result === 'MALFORMED')
}
{
  reset()
  const r = await push({ ...sub(2), packageName: 'com.someone.else' })
  check('another app’s notification is ignored', r.body.result === 'IGNORED_PACKAGE' && google.calls.length === 0)
}
{
  reset()
  const r = await push({ testNotification: { version: '1.0' } })
  check('the console’s test notification is acknowledged', r.status === 200 && r.body.result === 'TEST')
}

console.log('\nState comes from Play, not the message')
{
  reset()
  held()
  google.purchases[TOKEN] = playPurchase({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, 12)
  // The message says RENEWED; Play says CANCELED. Play wins.
  const r = await push(sub(2))
  check('a notification is re-read from Play, whatever it claims', r.body.result === 'APPLIED' &&
    row()?.status === 'cancelled', JSON.stringify(r.body))
  check('cancelled: access to the end of the paid period', access()?.renews === false)
}
{
  reset()
  held()
  google.purchases[TOKEN] = playPurchase({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }, -1)
  await push(sub(13))
  check('expired: no access', row()?.status === 'expired' && access() === undefined)
}
for (const [state, status, grants] of [
  ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'past_due', true],
  ['SUBSCRIPTION_STATE_ON_HOLD', 'unpaid', false],
  ['SUBSCRIPTION_STATE_PAUSED', 'paused', false],
] as const) {
  reset()
  held()
  google.purchases[TOKEN] = playPurchase({ subscriptionState: state, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' })
  await push(sub(6))
  check(`${state.replace('SUBSCRIPTION_STATE_', '').toLowerCase()}: ${grants ? 'access continues' : 'no access'}`,
    row()?.status === status && (access() !== undefined) === grants)
}
{
  reset()
  held()
  google.purchases[TOKEN] = playPurchase({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' })
  const first = await push(sub(2), { id: 'same-message' })
  const again = await push(sub(2), { id: 'same-message' })
  check('a redelivered message is recognised', first.body.result === 'APPLIED' && again.body.result === 'DUPLICATE')
}
{
  reset()
  google.purchases[TOKEN] = playPurchase()
  // The app closed before telling us: Google's notification finishes the job.
  table('subscriptions').push({ id: 'linked-old', user_id: USER, provider: 'google_play', status: 'expired' })
  google.purchases[TOKEN].linkedPurchaseToken = 'linked-old'
  const r = await push(sub(4))
  check('a purchase the app never reported is stored for the account it replaced', r.body.result === 'APPLIED' &&
    row()?.user_id === USER, JSON.stringify(r.body))
  check('and acknowledged, so it is not refunded', google.purchases[TOKEN].acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED')
}
{
  reset()
  google.purchases[TOKEN] = playPurchase()
  const r = await push(sub(4))
  check('a purchase with no account to link to waits for the app to link it', r.body.result === 'UNLINKED' && !row())
}
{
  reset()
  google.purchases[TOKEN] = playPurchase({ externalAccountIdentifiers: { obfuscatedExternalAccountId: 'deadbeef-0000-4000-8000-000000000000' } })
  const r = await push(sub(4))
  check('an account that no longer exists: not stored, and renewal stopped', r.body.result === 'UNKNOWN_USER' &&
    !row() && cancels().length === 1, JSON.stringify(r.body))
}

console.log('\nRefunds')
{
  reset()
  held()
  google.purchases[TOKEN] = playPurchase({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' })
  google.voided = [TOKEN]
  const r = await push(voided())
  check('a full refund Play confirms ends access at once', r.body.result === 'REFUNDED' && Boolean(row()?.refunded_at) &&
    access() === undefined, JSON.stringify(r.body))
  check('and stops it renewing', cancels().length === 1)
}
{
  reset()
  held()
  const r = await push(voided())
  check('a refund Play does not list is not believed', r.body.result === 'UNCONFIRMED' && !row()?.refunded_at &&
    access() !== undefined)
}
{
  reset()
  held()
  google.voided = [TOKEN]
  const r = await push(voided(2))
  check('a partial refund changes nothing', r.body.result === 'IGNORED' && !row()?.refunded_at)
}
{
  reset()
  held()
  google.voided = [TOKEN]
  google.purchases[TOKEN] = playPurchase()
  google.mode = 'cancelFails'
  const r = await push(voided())
  check('refunded but the cancel failed: retried', r.status === 502 && access() === undefined &&
    table('billing_events').length === 0)
}

console.log('\nRetries')
{
  reset()
  held()
  google.purchases[TOKEN] = playPurchase()
  google.mode = 'down'
  const r = await push(sub(2))
  check('Play unreachable: 503 and not logged, so Pub/Sub retries', r.status === 503 &&
    table('billing_events').length === 0 && row()?.status === 'active')
}
{
  reset()
  held()
  db.failing.add('billing_events')
  const r = await push(sub(2))
  check('the ledger unreadable: 503', r.status === 503)
}

await stub.shutdown()
finish('play-rtdn')
