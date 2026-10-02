/**
 * The health function, run for real against a stand-in PostgREST.
 *
 * What matters: it refuses anyone without the token, it says exactly what is
 * missing when something is, it counts the last day without leaking a row,
 * and it never echoes a secret back.
 *
 *   deno run --allow-net --allow-env supabase/test/health.ts
 */
const TOKEN = 'health-token-for-tests-only-0123456789'
Deno.env.set('SUPABASE_URL', 'http://localhost:8998')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-key')
Deno.env.set('SUPABASE_ANON_KEY', 'stub-anon-key')
Deno.env.set('OPENAI_TRIAL_KEY', 'sk-stub-never-echoed')

let schemaMissing: string[] = []

const stub = Deno.serve({ port: 8998, onListen: () => {} }, (req) => {
  const url = new URL(req.url)
  if (url.pathname === '/rest/v1/rpc/health_missing') return Response.json(schemaMissing)
  if (url.pathname === '/rest/v1/usage') {
    // Two reads: the day's spend (cost_micros) and the last 24h (outcome).
    return url.searchParams.get('select') === 'cost_micros'
      ? Response.json([{ cost_micros: 1200 }, { cost_micros: 800 }, { cost_micros: null }])
      : Response.json([{ outcome: 'OK' }, { outcome: 'OK' }, { outcome: 'PROVIDER_ERROR' }])
  }
  return Response.json({ message: 'not stubbed' }, { status: 404 })
})

await import('../functions/health/index.ts')

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failed++
}
const call = (token?: string) =>
  fetch('http://localhost:8000/', { headers: token ? { 'x-health-token': token } : {} })

{
  Deno.env.delete('HEALTH_TOKEN')
  const res = await call(TOKEN)
  check('without a configured token it refuses to run', res.status === 503, String(res.status))
  await res.body?.cancel()
  Deno.env.set('HEALTH_TOKEN', TOKEN)
}
{
  const res = await call('wrong')
  const text = await res.text()
  check('a wrong token is refused', res.status === 401, String(res.status))
  check('and told nothing', !text.includes('schema') && !text.includes('last24h'), text)
}
{
  const res = await call()
  check('no token is refused', res.status === 401, String(res.status))
  await res.body?.cancel()
}
{
  schemaMissing = []
  const res = await call(TOKEN)
  const text = await res.text()
  const body = JSON.parse(text)
  check('healthy is 200 and ok', res.status === 200 && body.ok === true, text.slice(0, 120))
  check('it says which version answered', res.headers.get('x-vimetry-version') === body.version, body.version)
  check('the day is summed', body.last24h.spentTodayMicros === 2000, String(body.last24h.spentTodayMicros))
  check('outcomes are counted', body.last24h.outcomes.OK === 2 && body.last24h.outcomes.PROVIDER_ERROR === 1,
    JSON.stringify(body.last24h.outcomes))
  check('no secret is echoed', !text.includes('sk-stub') && !text.includes('stub-service-key') && !text.includes(TOKEN))
}
{
  schemaMissing = ['function reserve_analysis', 'outcome SETTLED_LATE']
  const res = await call(TOKEN)
  const body = await res.json()
  check('a missing migration is 503 — the 25 Sep outage', res.status === 503 && body.ok === false, String(res.status))
  check('and names what is missing', JSON.stringify(body.schema.missing) === JSON.stringify(schemaMissing),
    JSON.stringify(body.schema.missing))
  schemaMissing = []
}
{
  Deno.env.delete('OPENAI_TRIAL_KEY')
  const res = await call(TOKEN)
  const body = await res.json()
  check('a missing OpenAI key is 503', res.status === 503, String(res.status))
  check('and named, not shown', body.secrets.missing[0] === 'OPENAI_TRIAL_KEY or OPENAI_MASTER_KEY', JSON.stringify(body.secrets))
  Deno.env.set('OPENAI_MASTER_KEY', 'sk-older-name')
  const fallback = await call(TOKEN)
  check('the older OPENAI_MASTER_KEY still counts', fallback.status === 200, String(fallback.status))
  await fallback.body?.cancel()
}

await stub.shutdown()
console.log(failed === 0 ? '\nhealth: all checks passed' : `\nhealth: ${failed} failed`)
Deno.exit(failed === 0 ? 0 : 1)
