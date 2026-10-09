/**
 * billing: the checkout and the customer portal, against the stand-in
 * database and a fake Lemon Squeezy.
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/billing.ts
 */
import { call, check, db, finish, lemon, resetDb, resetLemon, startDb, table } from './_stub.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const DAY = 86_400_000

Deno.env.set('SUPABASE_URL', 'http://localhost:8997')
Deno.env.set('SUPABASE_ANON_KEY', 'stub-anon-key')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')

const stub = startDb()
await import('../functions/billing/index.ts')

function reset(env: Record<string, string | undefined> = {}) {
  resetDb()
  resetLemon()
  db.users.add(USER)
  db.tokens.set('user-token', { id: USER, email: 'person@example.com' })
  const defaults = {
    LEMONSQUEEZY_API_KEY: 'ls-key-for-tests',
    LEMONSQUEEZY_STORE_ID: '123',
    LEMONSQUEEZY_VARIANT_ID: '456',
    LEMONSQUEEZY_TEST_MODE: '1',
    APP_URL: 'https://vimetry.app',
  }
  for (const [name, value] of Object.entries({ ...defaults, ...env })) {
    if (value === undefined) Deno.env.delete(name)
    else Deno.env.set(name, value)
  }
}

const subscription = (fields: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  user_id: USER,
  status: 'active',
  billing_anchor: new Date().getUTCDate(),
  renews_at: new Date(Date.now() + 30 * DAY).toISOString(),
  ends_at: null,
  refunded_at: null,
  last_payment_at: null,
  source_created_at: new Date(Date.now() - 10 * DAY).toISOString(),
  ...fields,
})

console.log('\nWho may ask')
{
  reset()
  const r = await call({ action: 'checkout' }, { token: 'stolen' })
  check('a stranger is refused, and Lemon Squeezy is never called', r.status === 401 && lemon.calls.length === 0)
}
{
  reset()
  const r = await call({ action: 'refund-me' }, { token: 'user-token' })
  check('an unknown action is refused', r.status === 400)
}

console.log('\nSubscribing')
{
  reset()
  const r = await call({ action: 'checkout' }, { token: 'user-token' })
  const sent = lemon.calls[0]?.body as { data: { attributes: Record<string, any>; relationships: Record<string, any> } }
  check('returns the hosted checkout', r.status === 200 && r.body.url === lemon.checkout, JSON.stringify(r.body))
  check('tied to this account by its id, in custom data', sent?.data.attributes.checkout_data.custom.user_id === USER)
  check('with the email prefilled', sent?.data.attributes.checkout_data.email === 'person@example.com')
  check('for the configured store and variant', sent?.data.relationships.store.data.id === '123' &&
    sent?.data.relationships.variant.data.id === '456')
  check('in test mode while testing', sent?.data.attributes.test_mode === true)
  check('coming back to Settings', sent?.data.attributes.product_options.redirect_url ===
    'https://vimetry.app/settings?billing=success')
  check('and expiring within the hour', Date.parse(sent?.data.attributes.expires_at) <= Date.now() + 3_600_000 + 1000)
}
{
  reset({ LEMONSQUEEZY_TEST_MODE: undefined })
  await call({ action: 'checkout' }, { token: 'user-token' })
  const sent = lemon.calls[0]?.body as { data: { attributes: Record<string, unknown> } }
  check('a live checkout once live', sent?.data.attributes.test_mode === false)
}
{
  reset()
  table('subscriptions').push(subscription())
  const r = await call({ action: 'checkout' }, { token: 'user-token' })
  check('nobody pays twice: refused while subscribed', r.status === 409 && r.body.error === 'already_subscribed' &&
    lemon.calls.length === 0, JSON.stringify(r.body))
}
{
  reset()
  table('subscriptions').push(subscription({ status: 'expired', ends_at: new Date(Date.now() - DAY).toISOString() }))
  const r = await call({ action: 'checkout' }, { token: 'user-token' })
  check('but an expired subscription does not stop a new one', r.status === 200)
}
{
  reset({ LEMONSQUEEZY_VARIANT_ID: undefined })
  const r = await call({ action: 'checkout' }, { token: 'user-token' })
  check('not configured: said so, not a broken link', r.status === 502 && r.body.error === 'billing_unavailable')
}
{
  reset()
  lemon.mode = 'error'
  const r = await call({ action: 'checkout' }, { token: 'user-token' })
  check('Lemon Squeezy down: said so', r.status === 502 && r.body.error === 'billing_unavailable')
}
{
  reset()
  db.failing.add('subscriptions')
  const r = await call({ action: 'checkout' }, { token: 'user-token' })
  check('the ledger down: no checkout on a guess', r.status === 503 && lemon.calls.length === 0)
}

console.log('\nManaging')
{
  reset()
  table('subscriptions').push(subscription())
  const r = await call({ action: 'portal' }, { token: 'user-token' })
  check('returns a freshly signed portal link', r.status === 200 && r.body.url === lemon.portal &&
    lemon.calls[0]?.path === '/v1/subscriptions/sub-1', JSON.stringify(r.body))
}
{
  reset()
  table('subscriptions').push(subscription({ id: 'old', source_created_at: new Date(Date.now() - 400 * DAY).toISOString(), status: 'expired' }))
  table('subscriptions').push(subscription({ id: 'new' }))
  await call({ action: 'portal' }, { token: 'user-token' })
  check('for the newest subscription', lemon.calls[0]?.path === '/v1/subscriptions/new', lemon.calls[0]?.path)
}
{
  reset()
  table('subscriptions').push(subscription({ user_id: 'someone-else' }))
  const r = await call({ action: 'portal' }, { token: 'user-token' })
  check('never someone else’s', r.status === 404 && lemon.calls.length === 0)
}

await stub.shutdown()
finish('billing')
