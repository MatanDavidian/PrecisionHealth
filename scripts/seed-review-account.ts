/**
 * Fills the app-store review account with a realistic few weeks of data, so a
 * Google (or Apple) reviewer signs in to something that looks like use.
 *
 *   npx vite-node scripts/seed-review-account.ts
 *
 * Signs in as REVIEW_EMAIL / REVIEW_PASSWORD from .env.local (the review
 * account the owner created; docs/ANDROID-APP.md, step 3) and writes through
 * the app's own Supabase repositories, under row-level security — so it can
 * write into that account and no other. It refuses:
 * - if the signed-in user is not the review account
 * - if the account already holds meals, so running it twice does not double
 *   the data
 *
 * The data is the app's own sample set (`buildSeed`), with every id made
 * fresh and every record moved to the review account. Nothing here is a real
 * person's. Times are in SEED_ZONE (default UTC), since reviewers are anywhere.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { buildSeed } from '../src/data/mock/seed'
import { createSupabaseRepositories } from '../src/data/supabase/supabaseRepositories'
import type { SettingsRepository } from '../src/data/repositories'
import { dayKey, type IanaZone } from '../src/domain'

const OWNER_ACCOUNT = '03272ea5-9d10-4610-a2b7-f2660fc006e7'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
)
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'REVIEW_EMAIL', 'REVIEW_PASSWORD']) {
  if (!env[name]) throw new Error(`${name} is missing from .env.local`)
}

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // Node 20 has no WebSocket, and this script never subscribes to anything.
  realtime: { transport: class {} as never },
})
const { data: signedIn, error } = await client.auth.signInWithPassword({
  email: env.REVIEW_EMAIL,
  password: env.REVIEW_PASSWORD,
})
const user = signedIn?.user
if (error || !user) throw new Error(`could not sign in as the review account: ${error?.message ?? 'no user'}`)
if (user.email !== env.REVIEW_EMAIL || user.id === OWNER_ACCOUNT) {
  throw new Error('refusing: signed in as an account that is not the review account')
}

const { count } = await client.from('meals').select('record_id', { count: 'exact', head: true }).eq('user_id', user.id)
if ((count ?? 0) > 0) {
  console.log(`The review account already holds ${count} meal records — nothing written.`)
  process.exit(0)
}

const zone = (process.env.SEED_ZONE ?? 'UTC') as IanaZone
const today = dayKey(new Date().toISOString(), zone)
const seed = buildSeed(today, zone)

/*
  Fresh ids, consistently: a meal's id, its items' mealId and every recordId
  map through one table, so the references between records survive. The
  sample's fixed ids would otherwise mark it as sample data.
*/
const fresh = new Map<string, string>()
const ID_KEYS = new Set(['id', 'mealId', 'recordId', 'supersedes', 'workoutId'])
function moved<T>(value: T): T {
  if (Array.isArray(value)) return value.map(moved) as T
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'userId') out[key] = user!.id
    else if (ID_KEYS.has(key) && typeof inner === 'string') {
      if (!fresh.has(inner)) fresh.set(inner, crypto.randomUUID())
      out[key] = fresh.get(inner)
    } else out[key] = moved(inner)
  }
  return out as T
}

// Settings never leave a device; this script has none to keep.
const noSettings = { get: async () => ({}), save: async () => {} } as unknown as SettingsRepository
const repositories = createSupabaseRepositories(client, noSettings)

const meals = seed.meals.map(moved)
const observations = seed.observations.map(moved)
const workouts = seed.workouts.map(moved)
const goals = seed.goals.map(moved)
for (const meal of meals) await repositories.meals.add(meal)
for (const observation of observations) await repositories.observations.add(observation)
for (const workout of workouts) await repositories.workouts.add(workout)
for (const goal of goals) await repositories.goals.add(goal)

console.log(
  `Wrote to ${user.email}: ${meals.length} meals, ${observations.length} readings, ` +
    `${workouts.length} workouts, ${goals.length} goals — up to ${today} (${zone}).`,
)
await client.auth.signOut()
