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
