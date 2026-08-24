/**
 * Composition root — the ONE place a concrete store is chosen.
 *
 * D3's promise, finally cashed: signing in swaps IndexedDB for Postgres here,
 * and no screen knows. The contract suite is what makes that safe rather than
 * hopeful — both adapters satisfy the same ten behavioural assertions.
 *
 * Settings are the deliberate exception. They stay on the device in both modes
 * because the API key must never sync (D14, Q8), so the Supabase adapter is
 * handed the local settings repository rather than pretending to store them.
 */
import { createIndexedDbRepositories, seedOnce } from './idb/indexedDbRepositories'
import { openHealthDB } from './idb/schema'
import { createSupabaseRepositories } from './supabase/supabaseRepositories'
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client'
import { buildSeed } from './mock/seed'
import type { HealthRepositories } from './repositories'
import { dayKey } from '@/domain'
import { FakeEstimator } from '@/ai/fakeEstimator'
import { OpenAiEstimator } from '@/ai/openaiEstimator'
import { ProxyEstimator } from '@/ai/proxyEstimator'
import type { FoodVisionEstimator } from '@/ai/estimator'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client'
import { deviceZone } from './newRecords'
import type { Session } from './session'

const dbPromise = openHealthDB()

/**
 * Always present: the signed-out store, the home of settings in both modes,
 * and — while signed in — the source the adoption flow reads from.
 */
export const localRepositories = createIndexedDbRepositories(dbPromise)

let active: HealthRepositories = localRepositories

/**
 * Read through this rather than holding a reference — the adapter changes when
 * the session does, and a captured one would keep writing to the wrong store.
 */
export const getRepositories = (): HealthRepositories => active

/** Called by the session subscription; the whole of the adapter switch. */
export async function selectRepositoriesFor(session: Session): Promise<HealthRepositories> {
  active =
    session.authenticated && isSupabaseConfigured
      ? createSupabaseRepositories(await getSupabaseClient(), localRepositories.settings)
      : localRepositories
  return active
}

/**
 * First-run sample data, so a fresh install has a day to look at rather than an
 * empty screen. Built for TODAY in the device's zone — conflict and unconfirmed
 * AI estimate included, because both paths should be visible from the start.
 *
 * Local only: a signed-in account is never seeded, and the demo day is left
 * behind when local data is adopted (its fixed ids give it away).
 */
export const ensureSeeded = (): Promise<boolean> => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const todayLocal = dayKey(new Date().toISOString(), zone)
  return seedOnce(dbPromise, buildSeed(todayLocal, zone))
}

/**
 * The AI composition root (D14) — the one place the estimator is chosen.
 *
 * The key and model are read on every call rather than captured here, so
 * editing them in Settings takes effect without a reload. `?fake=1` swaps in
 * the fake so the whole flow can be exercised without a key or any spend.
 */
const useFake = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fake')

/** `?fake=1&slow=6000` makes the fake take its time, so waiting states are visible. */
const fakeDelay = (): number =>
  typeof window === 'undefined'
    ? 0
    : Number(new URLSearchParams(window.location.search).get('slow') ?? 0) || 0

/**
 * Whether the active estimator needs the user to supply a key.
 *
 * The UI must gate on THIS, not on "is a key set" — otherwise an estimator
 * that needs no key is unreachable behind a setup prompt for a key it never
 * uses.
 */
const directEstimator = new OpenAiEstimator({
  getApiKey: async () => (await localRepositories.settings.get()).apiKey,
  getModel: async () => (await localRepositories.settings.get()).model,
})

let activeEstimator: FoodVisionEstimator = useFake()
  ? new FakeEstimator(undefined, undefined, fakeDelay())
  : directEstimator

/**
 * Whether the ACTIVE estimator needs the user to supply a key.
 *
 * The UI gates on this rather than on "is a key set": the proxy needs no key
 * at all, and the fake needs none either, so gating on the key would hide
 * analysis behind a setup prompt for something it never uses.
 */
let requiresKey = !useFake()
export const estimatorRequiresKey = (): boolean => requiresKey

/** Read through this — the estimator changes with the session, like the store. */
export const getEstimator = (): FoodVisionEstimator => activeEstimator

/**
 * Chooses who pays for analysis.
 *
 * Signed in with free analyses left → our server, on the owner's key: the
 * entire point, since a new user should be able to photograph a meal without
 * first creating an OpenAI account. Otherwise the direct adapter on the user's
 * own key, exactly as before. The server enforces the entitlement regardless;
 * this only decides which door to knock on.
 */
export function selectEstimatorFor(options: {
  authenticated: boolean
  trialExhausted: boolean
  getAccessToken: () => Promise<string | undefined>
  /** What the app should ask for when the user has expressed no preference. */
  suggestedModel?: string
}): FoodVisionEstimator {
  if (useFake()) {
    requiresKey = false
    activeEstimator = new FakeEstimator(undefined, undefined, fakeDelay())
    return activeEstimator
  }

  const canUseProxy =
    options.authenticated && !options.trialExhausted && isSupabaseConfigured

  if (canUseProxy) {
    requiresKey = false
    activeEstimator = new ProxyEstimator({
      supabaseUrl: SUPABASE_URL!,
      anonKey: SUPABASE_ANON_KEY!,
      getAccessToken: options.getAccessToken,
      getDay: () => dayKey(new Date().toISOString(), deviceZone()),
      getModel: async () =>
        (await localRepositories.settings.get()).trialModel ?? options.suggestedModel,
    })
  } else {
    requiresKey = true
    activeEstimator = directEstimator
  }
  return activeEstimator
}
