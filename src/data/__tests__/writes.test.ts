import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB, type IDBPDatabase } from 'idb'
import { createIndexedDbRepositories, seedOnce } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import { buildMeal, newId } from '../newRecords'
import { totalNutrients } from '../analytics'
import { goals, meals, observations, profile, sleep, workouts } from '../mock/seed'
import {
  canonical,
  confirmFoodItem,
  confirmObservation,
  convert,
  liveItems,
  resolveEffective,
  type Observation,
  type UserId,
} from '@/domain'

const USER = 'user-demo' as UserId
const seed = { profile, meals, workouts, sleep, observations, goals }

/**
 * Each test gets an empty database. The open connection must be closed first —
 * IndexedDB blocks a delete while anything still holds the database open, which
 * hangs rather than failing.
 */
let openConnection: IDBPDatabase<HealthDB> | undefined

const fresh = async () => {
  const db = openHealthDB()
  openConnection = await db
  return { db, repos: createIndexedDbRepositories(db) }
}

afterEach(() => {
  openConnection?.close()
  openConnection = undefined
})

beforeEach(async () => {
  await deleteDB(DB_NAME)
})

describe('persistence round-trip', () => {
  it('stores a meal and reads it back on the right day', async () => {
    const { repos } = await fresh()
    const at = new Date('2026-08-20T09:30:00')
    const meal = buildMeal(USER, {
      slot: 'BREAKFAST',
      at,
      items: [{ name: 'Oats', amount: 80, energyKcal: 300, proteinG: 11, carbsG: 55, fatG: 6 }],
    })

    await repos.meals.add(meal)
    const stored = await repos.meals.listByDay(USER, '2026-08-20')

    expect(stored).toHaveLength(1)
    expect(stored[0].items[0].name).toBe('Oats')
    // Entered in grams and kcal, stored canonically, read back unchanged.
    expect(convert(stored[0].items[0].nutrients.protein, 'g')).toBe(11)
  })

  it('files a meal by the local day, not the UTC day', async () => {
    const { repos } = await fresh()
    // 01:00 local on the 21st in Jerusalem is 22:00 UTC on the 20th, so a naive
    // implementation would file it on the wrong day.
    const at = new Date('2026-08-20T22:00:00.000Z')
    await repos.meals.add(
      buildMeal(
        USER,
        {
          slot: 'SNACK',
          at,
          items: [{ name: 'Late snack', amount: 50, energyKcal: 200, proteinG: 5, carbsG: 20, fatG: 10 }],
        },
        'Asia/Jerusalem',
      ),
    )

    expect(await repos.meals.listByDay(USER, '2026-08-21')).toHaveLength(1)
    expect(await repos.meals.listByDay(USER, '2026-08-20')).toHaveLength(0)
  })

  it('files sleep under the day you woke up', async () => {
    const { db, repos } = await fresh()
    await seedOnce(db, seed)
    // Seeded sleep runs 23:10 on the 17th to 06:42 on the 18th.
    expect(await repos.sleep.forDay(USER, '2026-08-18')).toHaveLength(1)
    expect(await repos.sleep.forDay(USER, '2026-08-17')).toHaveLength(0)
  })

  it('seeds once and not again', async () => {
    const { db } = await fresh()
    expect(await seedOnce(db, seed)).toBe(true)
    expect(await seedOnce(db, seed)).toBe(false)
  })

  it('returns every candidate for a code, leaving precedence to the caller', async () => {
    const { db, repos } = await fresh()
    await seedOnce(db, seed)
    const candidates = await repos.observations.listByDay(USER, '2026-08-18', 'WEIGHT')
    expect(candidates).toHaveLength(2)
  })
})

describe('corrections are appends, not edits', () => {
  it('confirming a conflict supersedes every candidate and wins', async () => {
    const { db, repos } = await fresh()
    await seedOnce(db, seed)

    const candidates = await repos.observations.listByDay(USER, '2026-08-18', 'WEIGHT')
    const chosen = candidates.find((o) => o.provenance.source === 'APPLE_HEALTH')!
    const confirmation = confirmObservation(chosen, candidates, '2026-08-18T18:00:00.000Z', newId)
    await repos.observations.add(confirmation)

    const after = await repos.observations.listByDay(USER, '2026-08-18', 'WEIGHT')
    expect(after).toHaveLength(3) // nothing was deleted
    const effective = resolveEffective(after)
    expect(effective?.id).toBe(confirmation.id)
    expect(effective?.provenance.kind).toBe('USER_CONFIRMED')
    // The user picked the phone's number, and it now stands over the scale's.
    expect(convert(effective!.value, 'kg')).toBeCloseTo(73.7, 3)
  })

  it('confirming an AI food estimate replaces it in totals without double counting', async () => {
    const { db, repos } = await fresh()
    await seedOnce(db, seed)

    const [lunch] = (await repos.meals.listByDay(USER, '2026-08-18')).filter((m) => m.slot === 'LUNCH')
    const estimate = lunch.items.find((i) => i.provenance.source === 'AI_ESTIMATE')!
    const before = totalNutrients([{ ...lunch, items: liveItems(lunch.items) }])

    // The user weighed it: 190 g, and 59 g protein rather than the estimated 53.
    const corrected = confirmFoodItem(estimate, '2026-08-18T13:30:00.000Z', newId, {
      amount: canonical(190, 'g'),
      nutrients: { ...estimate.nutrients, protein: canonical(59, 'g') },
    })
    await repos.meals.add({ ...lunch, items: [...lunch.items, corrected] })

    const [reloaded] = (await repos.meals.listByDay(USER, '2026-08-18')).filter((m) => m.slot === 'LUNCH')
    const live = liveItems(reloaded.items)
    const after = totalNutrients([{ ...reloaded, items: live }])

    expect(reloaded.items).toHaveLength(3) // estimate kept in history
    expect(live).toHaveLength(2) // but no longer counted
    expect(convert(after.protein, 'g') - convert(before.protein, 'g')).toBeCloseTo(6, 3)
  })

  it('keeps the superseded estimate readable for audit', async () => {
    const item = meals.flatMap((m) => m.items).find((i) => i.provenance.source === 'AI_ESTIMATE')!
    const confirmed = confirmFoodItem(item, '2026-08-18T13:30:00.000Z', newId)

    expect(confirmed.provenance.supersedes).toEqual([item.id])
    // The original still points at the inference that produced it.
    expect(item.provenance.inferenceId).toBeDefined()
  })
})

describe('observation candidates', () => {
  it('latest() returns all candidates from the most recent day', async () => {
    const { db, repos } = await fresh()
    await seedOnce(db, seed)

    const later: Observation = {
      ...(await repos.observations.listByDay(USER, '2026-08-18', 'WEIGHT'))[0],
      id: newId() as Observation['id'],
      time: { kind: 'instant', at: '2026-08-19T04:00:00.000Z', zone: 'Asia/Jerusalem' },
      value: canonical(72.5, 'kg'),
    }
    await repos.observations.add(later)

    const latest = await repos.observations.latest(USER, 'WEIGHT')
    expect(latest).toHaveLength(1)
    expect(convert(latest[0].value, 'kg')).toBeCloseTo(72.5, 3)
  })
})
