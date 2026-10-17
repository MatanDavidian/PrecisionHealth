/**
 * report-ai, run for real against a stand-in database.
 *
 * A public endpoint again, so the checks are what it refuses and what it will
 * not keep: anything that is not a report, anything too big, anything
 * personal in the note, and anything beyond the report's fixed shape — the
 * meal or the answer, if a client ever sent them.
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/report-ai.ts
 */
import { check, finish } from './_stub.ts'

Deno.env.set('SUPABASE_URL', 'http://localhost:8995')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')

let recorded: Record<string, unknown>[] = []
let down = false
const stub = Deno.serve({ port: 8995, onListen: () => {} }, async (req) => {
  if (new URL(req.url).pathname === '/rest/v1/rpc/record_ai_report') {
    if (down) return Response.json({ message: 'down' }, { status: 500 })
    recorded.push(await req.json())
    return Response.json(true)
  }
  return Response.json({ message: 'not stubbed' }, { status: 404 })
})
await import('../functions/report-ai/index.ts')

const post = (body: string) =>
  fetch('http://localhost:8000/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
const report = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ kind: 'estimate', reason: 'offensive', note: 'It insulted me', model: 'gpt-6-luna', version: 'abc', ...fields })

{
  recorded = []
  const r = await post(report())
  check('a report is recorded, and nothing is said back', r.status === 204 && recorded.length === 1, String(r.status))
  const [row] = recorded
  check('with its reason, note, model and build', row.p_kind === 'estimate' && row.p_reason === 'offensive' &&
    row.p_note === 'It insulted me' && row.p_model === 'gpt-6-luna' && row.p_version === 'abc', JSON.stringify(row))
}
{
  recorded = []
  await post(report({ note: '   ', model: undefined }))
  check('an empty note and a missing model are stored as nothing', recorded[0].p_note === null && recorded[0].p_model === null)
}
{
  recorded = []
  await post(report({
    note: 'mail me at me@example.com, here is sk-proj-abcdefghijklmnopqrstuvwx',
    meal: 'two eggs and toast',
    answer: 'You should not eat that',
    userId: '11111111-1111-4111-8111-111111111111',
  }))
  const text = JSON.stringify(recorded)
  check('the note is scrubbed on arrival', !text.includes('me@example.com') && !text.includes('sk-proj-abcdefgh'), text)
  check('and nothing outside the report is kept — not the meal, the answer or the account',
    !text.includes('eggs') && !text.includes('should not eat') && !text.includes('11111111-1111'), text)
}
{
  recorded = []
  await post(report({ note: 'too much salt '.repeat(70) }))
  check('a long note is cut to 500', String(recorded[0].p_note).length === 500)
}
for (const [name, body] of [
  ['not JSON', 'oops'],
  ['not a report', JSON.stringify({ hello: 'world' })],
  ['an unknown kind', report({ kind: 'payload' })],
  ['an unknown reason', report({ reason: 'spam' })],
] as const) {
  recorded = []
  const r = await post(body)
  await r.body?.cancel()
  check(`${name} is refused`, r.status === 400 && recorded.length === 0, String(r.status))
}
{
  recorded = []
  const r = await post(report({ note: 'x'.repeat(20_000) }))
  await r.body?.cancel()
  check('anything bigger than a report is refused unread', r.status === 413 && recorded.length === 0)
}
{
  down = true
  const r = await post(report())
  await r.body?.cancel()
  check('a database that cannot record says so', r.status === 503)
  down = false
}
{
  const r = await fetch('http://localhost:8000/', { method: 'GET' })
  await r.body?.cancel()
  check('only POST', r.status === 405)
}

await stub.shutdown()
finish('report-ai')
