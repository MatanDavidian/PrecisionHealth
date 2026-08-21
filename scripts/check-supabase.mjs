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

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  fail(`VITE_SUPABASE_URL looks wrong: ${url}\n    Expected https://<ref>.supabase.co (Project Settings → API → Project URL).`)
}
ok(`URL looks right (${new URL(url).hostname})`)

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

const base = url.replace(/\/$/, '')
const headers = { apikey: key, Authorization: `Bearer ${key}` }

let response
try {
  response = await fetch(`${base}/rest/v1/`, { headers })
} catch (cause) {
  fail(`Could not reach the project: ${cause}`)
}

if (response.status === 401) fail('The project rejected the key. Re-copy it from Project Settings → API.')
if (!response.ok) fail(`Project answered ${response.status} — is it still provisioning, or paused?`)
ok('Project reachable and key accepted')

// Is the schema there? An unknown table 404s with a clear message.
const meals = await fetch(`${base}/rest/v1/meals?select=record_id&limit=1`, { headers })
if (meals.status === 404) {
  fail('No `meals` table. Run supabase/migrations/0001 then 0002 in the SQL Editor.')
}
if (!meals.ok) fail(`Reading meals failed with ${meals.status}: ${(await meals.text()).slice(0, 200)}`)
ok('Schema applied (meals table present)')

// RLS: signed out, you must see nothing — not an error, an empty set.
const rows = await meals.json()
if (Array.isArray(rows) && rows.length === 0) {
  ok('Row-Level Security active (signed out sees no rows)')
} else {
  fail(`Signed-out request returned ${rows.length} row(s). RLS is not protecting this table — run migration 0002.`)
}

// And it must refuse a write from nobody.
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
