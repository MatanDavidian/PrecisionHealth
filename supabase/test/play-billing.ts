/**
 * play-billing, run for real against the stand-in database and a fake
 * Google (its OAuth endpoint checks our signed JWT with the real public key).
 *
 * The rules a bug here would break, each asserted on what is stored, what
 * was said to Google, and what the app then grants (`activePlan`):
 * - a purchase is believed only when Play confirms it
 * - it belongs to one account, and never moves to another
 * - one subscription per account: a second is left unacknowledged, so
 *   Google refunds it itself
 * - a confirmed purchase is acknowledged, or Google refunds it in three days
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/play-billing.ts
 */
import {
  call, check, db, finish, google, playPurchase, resetDb, resetGoogle, resetLemon, serviceAccount, startDb, table,
} from './_stub.ts'
import { activePlan, type SubscriptionRow } from '../functions/_shared/plan.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'
const TOKEN = 'play-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const DAY = 86_400_000

Deno.env.set('SUPABASE_URL', 'http://localhost:8997')
Deno.env.set('SUPABASE_ANON_KEY', 'stub-anon-key')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')
const SERVICE_ACCOUNT = await serviceAccount()

const stub = startDb()
await import('../functions/play-billing/index.ts')

function reset(env: Record<string, string | undefined> = {}) {
  resetDb()
  resetLemon()
  resetGoogle()
  db.users.add(USER)
  db.users.add(OTHER)
  db.tokens.set('user-token', { id: USER })
  db.tokens.set('other-token', { id: OTHER })
  const defaults = { GOOGLE_PLAY_SERVICE_ACCOUNT: SERVICE_ACCOUNT, GOOGLE_PLAY_PACKAGE: 'app.vimetry' }
  for (const [name, value] of Object.entries({ ...defaults, ...env })) {
    if (value === undefined) Deno.env.delete(name)
    else Deno.env.set(name, value)
  }
}

const row = (id = TOKEN) => table('subscriptions').find((r) => r.id === id) as SubscriptionRow | undefined
const access = () => activePlan(table('subscriptions') as unknown as SubscriptionRow[], new Date())
const acks = () => google.calls.filter((c) => c.path.endsWith(':acknowledge'))
const buy = (token = TOKEN, as = 'user-token') => call({ purchaseToken: token }, { token: as })

console.log('\nWho may claim a purchase')
{
  reset()
  google.purchases[TOKEN] = playPurchase()
  const r = await buy(TOKEN, 'stolen')
  check('a stranger is refused, and Google is never asked', r.status === 401 && google.calls.length === 0)
}
for (const [name, body] of [['no token', {}], ['a token with spaces', { purchaseToken: 'a b' }],
  ['an absurdly long token', { purchaseToken: 'x'.repeat(600) }]] as const) {
  reset()
  const r = await call(body, { token: 'user-token' })
  check(`${name} is refused`, r.status === 400 && google.calls.length === 0)
}
{
  reset({ GOOGLE_PLAY_SERVICE_ACCOUNT: undefined })
  const r = await buy()
  check('not configured: said so, nothing stored', r.status === 502 && r.body.error === 'billing_unavailable' && !row())
}
{
  reset()
  const r = await buy('a-token-play-never-issued')
  check('a token Play does not know is refused', r.status === 404 && r.body.error === 'unknown_purchase' && !row())
}

console.log('\nA purchase')
{
  reset()
  google.purchases[TOKEN] = playPurchase()
  const r = await buy()
  check('is confirmed with Play and accepted', r.status === 200 && r.body.ok === true, JSON.stringify(r.body))
  check('stored for this account, as a Google Play subscription', row()?.user_id === USER &&
    row()?.provider === 'google_play' && row()?.status === 'active')
  check('acknowledged, so Google does not refund it', acks().length === 1 &&
    google.purchases[TOKEN].acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED')
  check('and grants this month, renewing', access()?.renews === true && access()?.provider === 'google_play')
  const again = await buy()
  check('reporting it again changes nothing and acknowledges nothing twice', again.status === 200 && acks().length === 1 &&
    table('subscriptions').length === 1)
}
{
  reset()
  google.purchases[TOKEN] = playPurchase({ lineItems: [{ productId: 'something_else', expiryTime: new Date(Date.now() + 30 * DAY).toISOString() }] })
  const r = await buy()
  check('another product is refused, not stored, not acknowledged', r.status === 400 && !row() && acks().length === 0)
}
{
  reset()
  google.purchases[TOKEN] = playPurchase({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' })
  await buy()
  check('a pending payment is stored without access and not yet acknowledged', row()?.status === 'pending' &&
    access() === undefined && acks().length === 0)
}
{
  reset()
  google.purchases[TOKEN] = playPurchase({
    subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  }, 10)
  await buy()
  check('cancelled: access until the paid period ends', access()?.renews === false &&
    Date.parse(access()!.end) <= Date.now() + 10 * DAY + 1000, JSON.stringify(access()))
}

console.log('\nOne account per purchase, one plan per account')
{
  reset()
  google.purchases[TOKEN] = playPurchase()
  await buy(TOKEN, 'user-token')
  const r = await buy(TOKEN, 'other-token')
  check('a token already held by one account is refused to another', r.status === 403 && r.body.error === 'not_yours' &&
    row()?.user_id === USER)
}
{
  reset()
  google.purchases[TOKEN] = playPurchase({ externalAccountIdentifiers: { obfuscatedExternalAccountId: OTHER } })
  const r = await buy()
  check('a purchase Play says was made for someone else is refused', r.status === 403 && !row() && acks().length === 0)
}
{
  reset()
  table('subscriptions').push({
    id: 'ls-1', user_id: USER, provider: 'lemonsqueezy', status: 'active', billing_anchor: new Date().getUTCDate(),
    renews_at: new Date(Date.now() + 20 * DAY).toISOString(), ends_at: null, refunded_at: null, last_payment_at: null,
    source_created_at: new Date(Date.now() - 10 * DAY).toISOString(),
  })
  google.purchases[TOKEN] = playPurchase()
  const r = await buy()
  check('already subscribed on the website: refused', r.status === 409 && r.body.error === 'already_subscribed')
  check('left unacknowledged, so Google refunds it within three days, and not stored', acks().length === 0 && !row())
}
{
  reset()
  table('subscriptions').push({ id: 'old-token', user_id: USER, provider: 'google_play', status: 'cancelled',
    billing_anchor: 1, renews_at: null, ends_at: new Date(Date.now() + 2 * DAY).toISOString(), refunded_at: null,
    last_payment_at: null, source_created_at: new Date(Date.now() - 60 * DAY).toISOString() })
  google.purchases[TOKEN] = playPurchase({ linkedPurchaseToken: 'old-token' })
  const r = await buy()
  check('a re-subscription replaces the token it names', r.status === 200 && row('old-token')?.status === 'expired' &&
    row()?.status === 'active' && acks().length === 1, JSON.stringify(r.body))
}

console.log('\nWhen Google is in the way')
{
  reset()
  google.purchases[TOKEN] = playPurchase()
  google.mode = 'down'
  const r = await buy()
  check('Play unreachable: nothing decided, nothing stored', r.status === 502 && !row())
}
{
  reset()
  google.purchases[TOKEN] = playPurchase()
  google.mode = 'ackFails'
  const r = await buy()
  check('acknowledging failed: said so, and kept, for the app to retry on its next start', r.status === 502 &&
    row()?.status === 'active')
  google.mode = 'ok'
  const retry = await buy()
  check('the retry acknowledges it', retry.status === 200 &&
    google.purchases[TOKEN].acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED')
}

await stub.shutdown()
finish('play-billing')
