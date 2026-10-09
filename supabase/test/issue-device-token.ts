/**
 * issue-device-token, run for real against the stand-in database.
 *
 * The properties the watch's credential rests on: only the signed-in owner
 * can mint, for themselves only; the plaintext is returned once and never
 * stored — the row holds its sha256; and an account cannot pile up tokens.
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/issue-device-token.ts
 */
import { call, check, db, finish, resetDb, startDb, table } from './_stub.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'

Deno.env.set('SUPABASE_URL', 'http://localhost:8997')
Deno.env.set('SUPABASE_ANON_KEY', 'stub-anon-key')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')

const stub = startDb()
await import('../functions/issue-device-token/index.ts')

function reset() {
  resetDb()
  db.users.add(USER)
  db.users.add(OTHER)
  db.tokens.set('user-token', { id: USER })
}

const sha256 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('')

console.log('\nWho may mint')
{
  reset()
  const r = await call({ label: 'Watch' }, { token: 'stolen' })
  check('a stranger mints nothing', r.status === 401 && table('device_tokens').length === 0, String(r.status))
}
{
  reset()
  const r = await call({ label: 'Watch', user_id: OTHER }, { token: 'user-token' })
  check('for the caller only — an id in the body is ignored', r.status === 200 &&
    table('device_tokens').every((t) => t.user_id === USER), JSON.stringify(table('device_tokens')))
}
{
  reset()
  const response = await fetch('http://localhost:8000/', { method: 'GET' })
  await response.body?.cancel()
  check('only POST', response.status === 405)
}

console.log('\nThe token')
{
  reset()
  const r = await call({ label: 'Forerunner 265' }, { token: 'user-token' })
  const token = String(r.body.token ?? '')
  const [row] = table('device_tokens')
  check('is 256 random bits, as 64 hex characters', /^[0-9a-f]{64}$/.test(token), token.length.toString())
  check('is returned with its id, label and date', r.body.id === row?.id && r.body.label === 'Forerunner 265' &&
    typeof r.body.createdAt === 'string', JSON.stringify(r.body))
  check('is stored only as its sha256', row?.token_hash === await sha256(token) &&
    !JSON.stringify(table('device_tokens')).includes(token))
  const again = await call({ label: 'Forerunner 265' }, { token: 'user-token' })
  check('and is different every time', again.body.token !== token && table('device_tokens').length === 2)
}

console.log('\nThe label')
{
  reset()
  const r = await call({ label: '  Kitchen\nwatch\t ' }, { token: 'user-token' })
  check('control characters become spaces, the ends are trimmed', r.body.label === 'Kitchen watch', String(r.body.label))
}
{
  reset()
  const r = await call({ label: 'x'.repeat(500) }, { token: 'user-token' })
  check('a long label is cut to 60 characters', String(r.body.label).length === 60)
}
for (const label of [undefined, '', '   ', '\n\t']) {
  reset()
  const r = await call({ label }, { token: 'user-token' })
  check(`no label (${JSON.stringify(label)}) is refused`, r.status === 400 && r.body.error === 'label_required' &&
    table('device_tokens').length === 0)
}
{
  reset()
  const r = await call(undefined, { token: 'user-token', raw: 'not json' })
  check('a malformed request is refused', r.status === 400)
}

console.log('\nHow many')
{
  reset()
  for (let i = 0; i < 8; i++) table('device_tokens').push({ id: `t${i}`, user_id: USER, revoked_at: null })
  const r = await call({ label: 'Ninth' }, { token: 'user-token' })
  check('the ninth live token is refused', r.status === 409 && r.body.error === 'too_many_tokens' &&
    r.body.max === 8 && table('device_tokens').length === 8, JSON.stringify(r.body))
}
{
  reset()
  for (let i = 0; i < 8; i++) {
    table('device_tokens').push({ id: `t${i}`, user_id: USER, revoked_at: i === 0 ? new Date().toISOString() : null })
  }
  table('device_tokens').push({ id: 'theirs', user_id: OTHER, revoked_at: null })
  const r = await call({ label: 'Replacement' }, { token: 'user-token' })
  check('revoked tokens and other people’s do not count', r.status === 200, String(r.status))
}
{
  reset()
  db.failing.add('device_tokens')
  const r = await call({ label: 'Watch' }, { token: 'user-token' })
  check('a database that cannot count refuses, rather than minting blind', r.status === 500)
}

await stub.shutdown()
finish('issue-device-token')
