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
import type { FoodVisionEstimator } from '@/ai/estimator'
import type { Session } from './session'

const dbPromise = openHealthDB()

/** Always present: the signed-out store, and the home of settings in both modes. */
const localRepositories = createIndexedDbRepositories(dbPromise)

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

/**
 * Whether the active estimator needs the user to supply a key.
 *
 * The UI must gate on THIS, not on "is a key set" — otherwise an estimator
 * that needs no key is unreachable behind a setup prompt for a key it never
 * uses.
 */
export const estimatorRequiresKey = !useFake()

export const estimator: FoodVisionEstimator = useFake()
  ? new FakeEstimator()
  : new OpenAiEstimator({
      getApiKey: async () => (await localRepositories.settings.get()).apiKey,
      getModel: async () => (await localRepositories.settings.get()).model,
    })
