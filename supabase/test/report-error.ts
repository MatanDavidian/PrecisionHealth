/**
 * report-error, run for real against a stand-in database.
 *
 * It is a public endpoint, so the checks are about what it refuses and what
 * it will not keep: anything that is not a report, anything too big, and —
 * in what it does keep — anything personal.
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/report-error.ts
 */
import { check, finish } from './_stub.ts'

Deno.env.set('SUPABASE_URL', 'http://localhost:8996')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')

let recorded: Record<string, unknown>[] = []
let down = false
const stub = Deno.serve({ port: 8996, onListen: () => {} }, async (req) => {
  if (new URL(req.url).pathname === '/rest/v1/rpc/record_client_error') {
    if (down) return Response.json({ message: 'down' }, { status: 500 })
    recorded.push(await req.json())
    return Response.json(true)
  }
  return Response.json({ message: 'not stubbed' }, { status: 404 })
})
await import('../functions/report-error/index.ts')

const post = (body: string) =>
  fetch('http://localhost:8000/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
const report = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ kind: 'error', message: 'x is undefined', stack: 'Error\n  at f (https://vimetry.app/a.js:1:2)', route: '/log', ...fields })

{
  recorded = []
  const r = await post(report())
  check('a report is recorded, and nothing is said back', r.status === 204 && recorded.length === 1, String(r.status))
  const [row] = recorded
  check('with a sha256 fingerprint', /^[0-9a-f]{64}$/.test(String(row.p_fingerprint)))
}
{
  recorded = []
  await post(report({ message: 'Day 2026-10-09 failed' }))
  await post(report({ message: 'Day 2026-10-10 failed' }))
  check('the same error on another day’s data groups as one', recorded[0].p_fingerprint === recorded[1].p_fingerprint)
}
{
  recorded = []
  await post(report({
    message: 'failed for me@example.com with data:image/jpeg;base64,AAAABBBBCCCC',
    route: '/nutrition?d=2026-10-09',
    userId: '11111111-1111-4111-8111-111111111111',
  }))
  const text = JSON.stringify(recorded)
  check('scrubbed again on arrival — the client is not trusted to have done it', !text.includes('me@example.com') &&
    !text.includes('base64') && recorded[0].p_route === '/nutrition', text)
  check('and nothing outside the report is kept', !text.includes('11111111-1111'))
}
for (const [name, body] of [
  ['not JSON', 'oops'],
  ['not a report', JSON.stringify({ hello: 'world' })],
  ['an unknown kind', report({ kind: 'payload' })],
] as const) {
  recorded = []
  const r = await post(body)
  await r.body?.cancel()
  check(`${name} is refused`, r.status === 400 && recorded.length === 0, String(r.status))
}
{
  recorded = []
  const r = await post(report({ stack: 'x'.repeat(20_000) }))
  await r.body?.cancel()
  check('anything bigger than a report is refused unread', r.status === 413 && recorded.length === 0)
}
{
  down = true
  const r = await post(report())
  await r.body?.cancel()
  check('a database that cannot record says so, quietly', r.status === 503)
  down = false
}
{
  const r = await fetch('http://localhost:8000/', { method: 'GET' })
  await r.body?.cancel()
  check('only POST', r.status === 405)
}

await stub.shutdown()
finish('report-error')
