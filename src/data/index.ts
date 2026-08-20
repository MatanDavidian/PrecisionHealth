/**
 * Composition root — the ONE place the active store is chosen.
 *
 * D3's promise ("swapping in-memory → IndexedDB → HTTP touches one file and no
 * screens") is only true if nothing outside this file names a concrete
 * implementation. UI code imports `repositories` from here and stays ignorant
 * of what is behind it.
 */
import { inMemoryRepositories } from './mock/inMemoryRepositories'
import type { HealthRepositories } from './repositories'

export const repositories: HealthRepositories = inMemoryRepositories
