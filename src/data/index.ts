/**
 * Composition root — the ONE place the active store is chosen.
 *
 * D3's promise ("swapping the store touches one file and no screens") is only
 * true if nothing outside this file names a concrete implementation. UI code
 * imports `repositories` from here and stays ignorant of what is behind it.
 *
 * Slice 1 moved this from the in-memory mock to IndexedDB. That edit was this
 * file and nothing else.
 */
import { createIndexedDbRepositories, seedOnce } from './idb/indexedDbRepositories'
import { openHealthDB } from './idb/schema'
import { buildSeed } from './mock/seed'
import type { HealthRepositories } from './repositories'
import { dayKey } from '@/domain'
import { FakeEstimator } from '@/ai/fakeEstimator'
import { OpenAiEstimator } from '@/ai/openaiEstimator'
import type { FoodVisionEstimator } from '@/ai/estimator'

const dbPromise = openHealthDB()

export const repositories: HealthRepositories = createIndexedDbRepositories(dbPromise)

/**
 * First-run sample data, so a fresh install has a day to look at rather than an
 * empty screen. Built for TODAY in the device's zone — conflict and unconfirmed
 * AI estimate included, because both paths should be visible from the start.
 */
export const ensureSeeded = (): Promise<boolean> => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const todayLocal = dayKey(new Date().toISOString(), zone)
  return seedOnce(dbPromise, buildSeed(todayLocal, zone))
}

/**
 * The AI composition root (D14) — the one place the estimator is chosen, the
 * same rule the store follows.
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
 * that needs no key (the fake, and later the server-proxy mode from slice 3)
 * is unreachable behind a setup prompt for a key it never uses.
 */
export const estimatorRequiresKey = !useFake()

export const estimator: FoodVisionEstimator = useFake()
  ? new FakeEstimator()
  : new OpenAiEstimator({
      getApiKey: async () => (await repositories.settings.get()).apiKey,
      getModel: async () => (await repositories.settings.get()).model,
    })
