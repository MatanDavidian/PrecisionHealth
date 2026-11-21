/**
 * reminders, run for real against a stand-in database and push service.
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/reminders.ts
 */
import { call, check, finish } from './_stub.ts'
import { browserKeys, reset, rows, startDb, state } from './_reminderStub.ts'

Deno.env.set('SUPABASE_URL', 'http://localhost:8993')
Deno.env.set('SUPABASE_ANON_KEY', 'stub-anon')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')
startDb(8993)
await import('../functions/reminders/index.ts')

const DANA = 'aaaaaaaa-0000-4000-8000-000000000001'
const NOA = 'aaaaaaaa-0000-4000-8000-000000000002'
const signIn = () => {
  reset()
  state.tokens.set('dana-token', DANA)
  state.tokens.set('noa-token', NOA)
}
const subscription = async (endpoint = 'https://fcm.googleapis.com/fcm/send/dana-phone') => ({
  endpoint,
  keys: await browserKeys(),
})

{
  signIn()
  const r = await call({ action: 'available' })
  check('anyone may ask whether reminders exist, and learns only that', r.status === 200 &&
    JSON.stringify(r.body) === '{"available":true}' && state.vapid === undefined)
}
{
  signIn()
  const r = await call({ action: 'key' })
  check('a stranger gets nothing, not even the public key', r.status === 401 && state.vapid === undefined)
}
{
  signIn()
  const first = await call({ action: 'key' }, { token: 'dana-token' })
  const second = await call({ action: 'key' }, { token: 'noa-token' })
  const key = String(first.body.publicKey ?? '')
  check('the keys are made on first use: a 65-byte public key', /^[A-Za-z0-9_-]{87}$/.test(key), key.slice(0, 12))
  check('and kept: everyone gets the same one', second.body.publicKey === key)
}
{
  signIn()
  const r = await call({ action: 'subscribe', subscription: await subscription() }, { token: 'dana-token' })
  const [row] = rows('push_subscriptions')
  check('a device is remembered for its account', r.status === 200 && rows('push_subscriptions').length === 1 && row.user_id === DANA)
}
{
  signIn()
  const evil = await call(
    { action: 'subscribe', subscription: await subscription('https://evil.example/collect') },
    { token: 'dana-token' },
  )
  const internal = await call(
    { action: 'subscribe', subscription: await subscription('http://localhost:8993/rest/v1/meals') },
    { token: 'dana-token' },
  )
  check(
    'an address that is not a push service is refused, so the server is never pointed elsewhere',
    evil.status === 400 && internal.status === 400 && rows('push_subscriptions').length === 0,
  )
  const badKeys = await call(
    { action: 'subscribe', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'short', auth: 'x' } } },
    { token: 'dana-token' },
  )
  check('keys of the wrong shape are refused', badKeys.status === 400)
}
{
  signIn()
  const shared = await subscription('https://fcm.googleapis.com/fcm/send/family-tablet')
  await call({ action: 'subscribe', subscription: shared }, { token: 'dana-token' })
  await call({ action: 'subscribe', subscription: shared }, { token: 'noa-token' })
  const held = rows('push_subscriptions')
  check('a device moves with whoever subscribed it last', held.length === 1 && held[0].user_id === NOA)
}
{
  signIn()
  for (let n = 0; n < 10; n += 1) {
    await call({ action: 'subscribe', subscription: await subscription(`https://fcm.googleapis.com/fcm/send/d${n}`) }, { token: 'dana-token' })
  }
  const eleventh = await call({ action: 'subscribe', subscription: await subscription('https://fcm.googleapis.com/fcm/send/d10') }, { token: 'dana-token' })
  check('at most ten devices per person', eleventh.status === 409 && rows('push_subscriptions').length === 10, String(eleventh.status))
}
{
  signIn()
  const mine = await subscription()
  await call({ action: 'subscribe', subscription: mine }, { token: 'dana-token' })
  await call({ action: 'unsubscribe', endpoint: mine.endpoint }, { token: 'noa-token' })
  check('nobody can remove someone else’s device', rows('push_subscriptions').length === 1)
  await call({ action: 'unsubscribe', endpoint: mine.endpoint }, { token: 'dana-token' })
  check('its owner can', rows('push_subscriptions').length === 0)
}
{
  signIn()
  await call({ action: 'key' }, { token: 'dana-token' })
  await call({ action: 'subscribe', subscription: await subscription() }, { token: 'dana-token' })
  const r = await call({ action: 'test', lang: 'he' }, { token: 'dana-token' })
  const [push] = state.pushes
  check('a test goes to the person’s own devices, now', r.status === 200 && r.body.sent === 1 && state.pushes.length === 1)
  check(
    'encrypted (aes128gcm), signed (VAPID), and short-lived',
    push.headers.get('content-encoding') === 'aes128gcm' &&
      (push.headers.get('authorization') ?? '').startsWith('vapid t=') &&
      push.headers.get('ttl') === '600' &&
      push.headers.get('topic') === 'vimetry-test',
  )
  check('the push service sees bytes, never the words', !new TextDecoder().decode(push.body).includes('reminder'))
}
{
  signIn()
  await call({ action: 'key' }, { token: 'dana-token' })
  const gone = await subscription('https://fcm.googleapis.com/fcm/send/uninstalled')
  await call({ action: 'subscribe', subscription: gone }, { token: 'dana-token' })
  state.pushStatus.set(gone.endpoint, 410)
  const r = await call({ action: 'test' }, { token: 'dana-token' })
  check('a device the push service says is gone is forgotten', r.body.gone === 1 && rows('push_subscriptions').length === 0)
}

finish('reminders')
