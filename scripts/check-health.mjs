/**
 * Is the server side healthy — the daily check, and the check after a deploy.
 *
 *   node scripts/check-health.mjs                 everything (daily)
 *   node scripts/check-health.mjs --after-deploy  versions and health, no analysis
 *
 * Three questions:
 *   1. Is every function the version on main?  (an owed deploy, a stray one)
 *   2. Does `health` say the server is whole?   (the 25 Sep outage: a missing
 *      migration; a missing secret; spend near the day's ceiling)
 *   3. Does a real analysis work end to end?    (a revoked key, a retired model)
 *
 * Reads from the environment, falling back to .env.local for local runs:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY   (public, also in the bundle)
 *   HEALTH_TOKEN                                (the `health` function's secret)
 *   MONITOR_EMAIL, MONITOR_PASSWORD             (an admin account for step 3)
 *   HC_PING_URL                                 (optional: healthchecks.io)
 *
 * Runs in a PUBLIC repository's CI, so it prints names, versions and counts
 * only — never a token, an email address, or a response body.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const AFTER_DEPLOY = process.argv.includes('--after-deploy')
const FUNCTIONS = [
  'estimate-food',
  'delete-account',
  'issue-device-token',
  'device-sync',
  'health',
  'billing',
  'lemonsqueezy-webhook',
  'report-error',
]
/** Alert before the ceiling refuses people, not after. */
const SPEND_WARNING = 0.8
/** Browser errors since yesterday at which the daily check turns red and emails. */
const ERROR_WARNING = 25

const fromFile = existsSync('.env.local')
  ? Object.fromEntries(
      readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
        .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
    )
  : {}
const env = (name) => process.env[name] || fromFile[name] || ''

const SUPABASE_URL = env('VITE_SUPABASE_URL')
const ANON_KEY = env('VITE_SUPABASE_ANON_KEY')
const failures = []
const fail = (message) => {
  failures.push(message)
  console.log(`  ✗ ${message}`)
}
const pass = (message) => console.log(`  ✓ ${message}`)

if (!SUPABASE_URL || !ANON_KEY) {
  console.log('✗ VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
  process.exit(1)
}

// 1 — versions
console.log('Functions')
/*
  The commit the functions SHOULD be at: the last one on main that touched
  them. The deploy script stamps exactly this, so any other answer is a deploy
  that was owed or one that did not come from main.
*/
let expected = ''
try {
  execSync('git fetch -q origin main', { stdio: 'ignore' })
} catch {}
try {
  expected = execSync('git log -1 --format=%H origin/main -- supabase/functions').toString().trim()
} catch {
  fail('cannot read the expected version from git')
}
for (const name of FUNCTIONS) {
  try {
    // The CORS preflight needs no credentials, and every function stamps it.
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://vimetry.app', 'Access-Control-Request-Method': 'POST' },
    })
    const version = response.headers.get('x-vimetry-version')
    if (!version) fail(`${name}: no version header — deployed before version stamps, or not deployed`)
    else if (expected && version !== expected) {
      fail(`${name}: serves ${version.slice(0, 7)}, main is ${expected.slice(0, 7)} — a deploy is owed`)
    } else pass(`${name} ${version.slice(0, 7)}`)
  } catch {
    fail(`${name}: unreachable`)
  }
}

// 2 — health
console.log('Health')
const token = env('HEALTH_TOKEN')
if (!token) fail('HEALTH_TOKEN is not set')
else {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/health`, {
      headers: { 'x-health-token': token, apikey: ANON_KEY },
    })
    const body = await response.json().catch(() => ({}))
    if (response.status === 404) fail('health is not deployed — run scripts/deploy-functions.sh')
    else if (response.status === 401) fail('health refused the token')
    else if (body.error === 'not_configured') fail('health has no HEALTH_TOKEN secret set')
    else {
      if (body.schema?.ok) pass('database has everything the functions call')
      else fail(`database is missing: ${(body.schema?.missing ?? ['(no answer)']).join(', ')}`)
      if (body.secrets?.ok) pass('secrets are set')
      else fail(`secrets missing: ${(body.secrets?.missing ?? ['(no answer)']).join(', ')}`)

      const day = body.last24h ?? {}
      if (day.error) fail(day.error)
      else {
        const dollars = (micros) => `$${(micros / 1_000_000).toFixed(2)}`
        const ceilings = [['trials', day.spentTodayMicros, day.ceilingMicros]]
        if (day.planCeilingMicros) ceilings.push(['subscribers', day.planSpentTodayMicros ?? 0, day.planCeilingMicros])
        for (const [who, spentMicros, ceiling] of ceilings) {
          const share = ceiling ? spentMicros / ceiling : 0
          const line = `${who}: spent today ${dollars(spentMicros)} of ${dollars(ceiling)}`
          if (share >= SPEND_WARNING) fail(`${line} — over ${SPEND_WARNING * 100}% of the daily ceiling`)
          else pass(line)
        }
        const outcomes = Object.entries(day.outcomes ?? {})
          .map(([outcome, count]) => `${outcome} ${count}`)
          .join(', ')
        console.log(`    last 24h: ${outcomes || 'no analyses'}`)
      }

      // What broke in people's browsers since yesterday (report-error).
      const errors = body.clientErrors
      if (!errors) console.log('    browser errors: not reported by this deploy')
      else if (errors.error) fail(errors.error)
      else {
        const line = `browser errors since yesterday: ${errors.total} (${errors.distinct} distinct)`
        if (errors.total >= ERROR_WARNING) fail(`${line} — at or over ${ERROR_WARNING}`)
        else pass(line)
        for (const top of errors.top ?? []) {
          console.log(`    ${top.count}× ${top.kind} on ${top.route ?? '?'} (${top.version ?? '?'}): ${top.message}`)
        }
      }
    }
  } catch {
    fail('health: unreachable')
  }
}

// 3 — a real analysis, end to end
if (!AFTER_DEPLOY) {
  console.log('Analysis')
  const email = env('MONITOR_EMAIL')
  const password = env('MONITOR_PASSWORD')
  if (!email || !password) fail('MONITOR_EMAIL and MONITOR_PASSWORD are not set')
  else {
    try {
      const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const session = await signIn.json()
      if (!session.access_token) fail(`monitoring account could not sign in (${signIn.status})`)
      else {
        // The cheapest model, the same id the app offers as "Fastest".
        const prompt = readFileSync('supabase/functions/_shared/prompt.ts', 'utf8')
        const model = prompt.match(/export const MODEL_LUNA = '([^']+)'/)?.[1]
        const started = Date.now()
        const response = await fetch(`${SUPABASE_URL}/functions/v1/estimate-food`, {
          method: 'POST',
          headers: {
            apikey: ANON_KEY,
            authorization: `Bearer ${session.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            text: 'one medium banana',
            hints: {},
            day: new Date().toISOString().slice(0, 10),
            model,
            conversationId: crypto.randomUUID(),
          }),
        })
        const body = await response.json().catch(() => ({}))
        const seconds = ((Date.now() - started) / 1000).toFixed(1)
        if (response.ok && body.content) pass(`a real analysis works (${body.model ?? model}, ${seconds}s)`)
        else fail(`analysis failed: ${response.status} ${body.error ?? ''}`.trim())
      }
    } catch {
      fail('analysis: unreachable')
    }
  }
}

// The dead-man's switch: silence from this script is itself an alert.
const ping = env('HC_PING_URL')
if (ping && !AFTER_DEPLOY) {
  await fetch(failures.length ? `${ping}/fail` : ping, { method: 'POST' }).catch(() => {})
}

console.log(failures.length ? `\n✗ ${failures.length} problem(s)` : '\n✓ healthy')
process.exit(failures.length ? 1 : 0)
