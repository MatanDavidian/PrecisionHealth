/**
 * Confirms .env.local actually works, without anyone reading a secret aloud.
 *
 * Checks, in order: both values present, they look like what they claim to be,
 * the project answers, the key is accepted, the schema is applied, and — the
 * one that matters — that an unauthenticated caller sees no data, which is
 * Row-Level Security doing its job.
 *
 *   npm run supabase:check
 */
import { readFileSync } from 'node:fs'

const read = () => {
  let raw
  try {
    raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  } catch {
    fail('.env.local not found. Copy .env.example to .env.local and fill it in.')
  }
  const env = {}
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const ok = (m) => console.log(`  ✓ ${m}`)
const warn = (m) => console.log(`  ! ${m}`)
const fail = (m) => {
  console.error(`  ✗ ${m}`)
  process.exit(1)
}

const env = read()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY

console.log('\nChecking .env.local\n')

if (!url) fail('VITE_SUPABASE_URL is empty.')
if (!key) fail('VITE_SUPABASE_ANON_KEY is empty.')

// The likely mistake: copying the dashboard address instead of the API one.
const dashboard = /supabase\.com\/dashboard\/project\/([a-z0-9]+)/.exec(url)
if (dashboard) {
  fail(
    'That is the dashboard URL, not the project API URL.\n' +
      `    Use: https://${dashboard[1]}.supabase.co\n` +
      '    (Project Settings → Data API → Project URL, or take the ref from the dashboard address.)',
  )
}

// A bare project ref is unambiguous, so accept it rather than nit-picking.
const bareRef = /^[a-z0-9]{16,}$/.test(url)
const normalisedUrl = bareRef ? `https://${url}.supabase.co` : url
if (bareRef) warn(`Read that as a project ref; using ${normalisedUrl}`)

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(normalisedUrl)) {
  fail(
    `VITE_SUPABASE_URL looks wrong: ${url}\n` +
      '    Expected https://<ref>.supabase.co — Project Settings → Data API → Project URL.',
  )
}
ok(`URL looks right (${new URL(normalisedUrl).hostname})`)

// The dangerous mistake this script exists to catch.
if (key.startsWith('sb_secret_') || /"role"\s*:\s*"service_role"/.test(decodeJwt(key) ?? '')) {
  fail(
    'That is the SERVICE ROLE key. It bypasses Row-Level Security entirely —\n' +
      '    every policy becomes decorative, and anyone with your bundle owns the data.\n' +
      '    Use the anon / publishable key instead, and rotate that one now.',
  )
}

if (key.startsWith('sb_publishable_')) ok('Key format: publishable (current style)')
else if (key.startsWith('eyJ')) ok('Key format: anon JWT (legacy style, still fine)')
else warn(`Key format unrecognised — continuing, but check you copied the anon/publishable key`)

const base = normalisedUrl.replace(/\/$/, '')
const headers = { apikey: key, Authorization: `Bearer ${key}` }

/**
 * One request answers everything, if you read the BODY rather than the status.
 *
 * Signed out, the app connects as `anon`, and migration 0002 grants `anon`
 * nothing at all — so the correct response is Postgres refusing the table
 * (42501). That shares HTTP 401 with "your key is wrong", which is why the
 * first version of this script reported a working project as broken.
 */
let probe
try {
  probe = await fetch(`${base}/rest/v1/meals?select=record_id&limit=1`, { headers })
} catch (cause) {
  fail(`Could not reach the project: ${cause}`)
}

const bodyText = await probe.text()
let body
try {
  body = JSON.parse(bodyText)
} catch {
  body = null
}
const code = body?.code
const message = String(body?.message ?? '')

if (/invalid.*api key|JWSError|PGRST301/i.test(message) || code === 'PGRST301') {
  fail(`The project rejected the key: ${message}\n    Re-copy it from Project Settings → Data API.`)
}
if (code === 'PGRST205' || probe.status === 404) {
  fail('No `meals` table — run supabase/migrations/0001 then 0002 in the SQL Editor.')
}

ok('Project reachable and key accepted')

if (code === '42501') {
  // The intended state: no grant for anon, so a signed-out read cannot even start.
  ok('Schema applied (meals table present)')
  ok('Signed out is refused at the grant level — stricter than RLS filtering')
} else if (probe.ok && Array.isArray(body)) {
  ok('Schema applied (meals table present)')
  if (body.length === 0) {
    warn(
      'Signed-out reads are permitted but return no rows.\n' +
        '      RLS is filtering, but `anon` still holds a SELECT grant — re-run migration 0002\n' +
        '      if you want signed-out callers refused outright.',
    )
  } else {
    fail(`Signed-out read returned ${body.length} row(s). Neither grants nor RLS are protecting this table — run migration 0002.`)
  }
} else {
  fail(`Unexpected response ${probe.status}: ${bodyText.slice(0, 200)}`)
}

// And a write from nobody must be refused.
const write = await fetch(`${base}/rest/v1/meals`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    record_id: 'anon-probe',
    meal_id: 'anon-probe',
    version: 1,
    user_id: '00000000-0000-0000-0000-000000000000',
    day: '2026-01-01',
    data: {},
  }),
})
if (write.ok) fail('An unauthenticated write SUCCEEDED. Migration 0002 has not been applied.')
ok(`Unauthenticated writes refused (${write.status})`)

console.log('\n✓ Supabase is configured correctly.\n')

function decodeJwt(token) {
  try {
    return Buffer.from(token.split('.')[1], 'base64').toString('utf8')
  } catch {
    return null
  }
}
