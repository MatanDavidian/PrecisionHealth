/**
 * delete-account, run for real against the stand-in database and a fake
 * Lemon Squeezy.
 *
 * It does one irreversible thing, so each guard is asserted on what was NOT
 * done as much as on what was: no deletion without the confirmation, none of
 * anyone else, and none while a subscription would go on charging.
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/delete-account.ts
 */
import { call, check, db, finish, lemon, resetDb, resetLemon, startDb, table } from './_stub.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

Deno.env.set('SUPABASE_URL', 'http://localhost:8997')
Deno.env.set('SUPABASE_ANON_KEY', 'stub-anon-key')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')
Deno.env.set('LEMONSQUEEZY_API_KEY', 'ls-key-for-tests')

const stub = startDb()
await import('../functions/delete-account/index.ts')

function reset() {
  resetDb()
  resetLemon()
  db.users.add(USER)
  db.users.add(OTHER)
  db.tokens.set('user-token', { id: USER })
  table('meals').push({ user_id: USER, record_id: 'm1' }, { user_id: OTHER, record_id: 'm2' })
  table('usage').push({ user_id: USER, id: 'u1' })
}

const subscription = (status: string, id = 'sub-1') => ({ id, user_id: USER, status })
const deletes = () => lemon.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)
const deleted = () => db.deletedUsers.includes(USER)

console.log('\nThe guards')
{
  reset()
  const r = await call({ confirm: 'DELETE' }, { token: 'stolen' })
  check('a stranger deletes nothing', r.status === 401 && db.deletedUsers.length === 0)
}
{
  reset()
  const r = await call({ confirm: 'delete' }, { token: 'user-token' })
  check('without the exact confirmation, nothing', r.status === 400 && r.body.error === 'not_confirmed' && !deleted())
}
{
  reset()
  const r = await call(undefined, { token: 'user-token', raw: 'not json' })
  check('a malformed request, nothing', r.status === 400 && !deleted())
}
{
  reset()
  const r = await call({ confirm: 'DELETE', userId: OTHER }, { token: 'user-token' })
  check('the id comes from the token, never the body', r.status === 200 && deleted() &&
    !db.deletedUsers.includes(OTHER) && table('meals').some((m) => m.user_id === OTHER))
}

console.log('\nDeleting')
{
  reset()
  const r = await call({ confirm: 'DELETE' }, { token: 'user-token' })
  check('deletes the account', r.status === 200 && r.body.deleted === true && deleted(), JSON.stringify(r.body))
  check('and everything that was theirs, by the cascade', !table('meals').some((m) => m.user_id === USER) &&
    table('usage').length === 0)
  check('with no subscription, Lemon Squeezy is never called', lemon.calls.length === 0)
}
{
  reset()
  db.noCascade.add('meals')
  const r = await call({ confirm: 'DELETE' }, { token: 'user-token' })
  check('a table that lost its cascade is reported, not hidden', r.status === 500 &&
    JSON.stringify(r.body.leftover).includes('meals: 1 rows remain'), JSON.stringify(r.body))
}

console.log('\nBilling stops first')
{
  reset()
  table('subscriptions').push(subscription('active'))
  const r = await call({ confirm: 'DELETE' }, { token: 'user-token' })
  check('an active subscription is cancelled at Lemon Squeezy', deletes().join() === '/v1/subscriptions/sub-1')
  check('then the account goes, subscription row with it', r.status === 200 && deleted() &&
    table('subscriptions').length === 0)
}
{
  reset()
  table('subscriptions').push(subscription('past_due', 'a'), subscription('cancelled', 'b'), subscription('expired', 'c'))
  await call({ confirm: 'DELETE' }, { token: 'user-token' })
  check('only what still charges is cancelled', deletes().join() === '/v1/subscriptions/a', deletes().join())
}
{
  reset()
  table('subscriptions').push(subscription('active'))
  lemon.mode = 'error'
  const r = await call({ confirm: 'DELETE' }, { token: 'user-token' })
  check('if the cancel fails, the account is NOT deleted', r.status === 502 &&
    r.body.error === 'billing_cancel_failed' && !deleted() && table('meals').some((m) => m.user_id === USER),
    JSON.stringify(r.body))
}
{
  reset()
  table('subscriptions').push(subscription('active'))
  lemon.mode = 'missing'
  const r = await call({ confirm: 'DELETE' }, { token: 'user-token' })
  check('a subscription Lemon Squeezy no longer has is not a reason to refuse', r.status === 200 && deleted())
}
{
  reset()
  table('subscriptions').push(subscription('active'))
  Deno.env.delete('LEMONSQUEEZY_API_KEY')
  const r = await call({ confirm: 'DELETE' }, { token: 'user-token' })
  Deno.env.set('LEMONSQUEEZY_API_KEY', 'ls-key-for-tests')
  check('nor is billing left running when no API key is configured', r.status === 502 && !deleted())
}
{
  reset()
  db.failing.add('subscriptions')
  const r = await call({ confirm: 'DELETE' }, { token: 'user-token' })
  check('subscriptions unreadable: refused rather than risk a live one', r.status === 503 && !deleted())
}

await stub.shutdown()
finish('delete-account')
