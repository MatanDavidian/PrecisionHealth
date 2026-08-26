import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB, type IDBPDatabase } from 'idb'
import { createIndexedDbRepositories } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import { buildMeal, newId } from '../newRecords'
import { buildEstimatedMeal } from '../estimatedMeal'
import { totalNutrients } from '../analytics'
import { FakeEstimator } from '@/ai/fakeEstimator'
import {
  applyMealEdit,
  convert,
  editableItem,
  latestVersions,
  liveItems,
  needsConfirmation,
  restoreMeal,
  retractMeal,
  scaleTo,
  type Meal,
  type UserId,
} from '@/domain'

const USER = 'user-demo' as UserId
const DAY = '2026-08-26'
const NOW = '2026-08-26T13:00:00.000Z'

let openConnection: IDBPDatabase<HealthDB> | undefined

const fresh = async () => {
  const db = openHealthDB()
  openConnection = await db
  return createIndexedDbRepositories(db)
}

afterEach(() => {
  openConnection?.close()
  openConnection = undefined
})

beforeEach(async () => {
  await deleteDB(DB_NAME)
})

const lunch = () =>
  buildMeal(USER, {
    slot: 'LUNCH',
    at: new Date('2026-08-26T12:30:00'),
    items: [
      { name: 'Rice', amount: 300, energyKcal: 400, proteinG: 8, carbsG: 88, fatG: 2 },
      { name: 'Chicken', amount: 170, energyKcal: 280, proteinG: 53, carbsG: 0, fatG: 6 },
    ],
  })

/** What the day now reads as, straight from the store — the whole point. */
const readDay = async (repos: Awaited<ReturnType<typeof fresh>>) => {
  const stored = await repos.meals.listByDay(USER, DAY)
  const live = latestVersions(stored).map((meal) => ({ ...meal, items: liveItems(meal.items) }))
  return { stored, live, totals: totalNutrients(live) }
}

describe('editing a meal already in the store', () => {
  it('re-portioning moves the day total, and the old version is still on disk', async () => {
    const repos = await fresh()
    const meal = lunch()
    await repos.meals.add(meal)

    const before = await readDay(repos)
    expect(convert(before.totals.energy, 'kcal')).toBe(680)

    // The rice was nearer 150 g than 300 g: halve it and let the rest follow.
    const items = liveItems(meal.items).map((item) =>
      item.name === 'Rice' ? scaleTo(editableItem(item), 150) : editableItem(item),
    )
    await repos.meals.add(applyMealEdit(meal, { items }, NOW, newId))

    const after = await readDay(repos)
    expect(after.live).toHaveLength(1)
    expect(convert(after.totals.energy, 'kcal')).toBe(480)
    expect(convert(after.totals.protein, 'g')).toBe(57)

    // D4/D15: nothing was overwritten. Both versions are readable.
    expect(after.stored).toHaveLength(2)
    expect(after.stored.map((m) => m.version).sort()).toEqual([1, 2])
  })

  it('correcting an AI estimate settles it, so it stops asking to be confirmed', async () => {
    const repos = await fresh()
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { meal, inference } = buildEstimatedMeal(USER, {
      slot: 'LUNCH',
      at: new Date('2026-08-26T12:30:00'),
      zone: 'Asia/Jerusalem',
      hints: {},
      source: { kind: 'photo', photo: { width: 1, height: 1, bytes: 1, sha256: 'a'.repeat(64) } },
      result,
    })
    await repos.inferences.add(inference)
    await repos.meals.add(meal)

    const before = await readDay(repos)
    expect(before.live[0].items.every((item) => needsConfirmation(item.provenance))).toBe(true)

    const items = liveItems(meal.items).map((item) => scaleTo(editableItem(item), 100))
    await repos.meals.add(applyMealEdit(meal, { items }, NOW, newId))

    const after = await readDay(repos)
    expect(after.live[0].items.some((item) => needsConfirmation(item.provenance))).toBe(false)
    // The estimate itself is not gone — it is superseded inside the record,
    // so "what did the model actually say?" still has an answer.
    expect(after.stored.find((m) => m.version === 2)!.items).toHaveLength(4)
  })

  it('removing one food leaves the other and takes its calories with it', async () => {
    const repos = await fresh()
    const meal = lunch()
    await repos.meals.add(meal)

    const rice = liveItems(meal.items).find((item) => item.name === 'Rice')!
    await repos.meals.add(applyMealEdit(meal, { items: [], removed: [rice.id] }, NOW, newId))

    const after = await readDay(repos)
    expect(after.live[0].items.map((item) => item.name)).toEqual(['Chicken'])
    expect(convert(after.totals.energy, 'kcal')).toBe(280)
  })

  it('moving a meal to another slot keeps it on the same day', async () => {
    const repos = await fresh()
    const meal = lunch()
    await repos.meals.add(meal)
    await repos.meals.add(
      applyMealEdit(meal, { items: [], slot: 'DINNER' }, NOW, newId),
    )

    const after = await readDay(repos)
    expect(after.live).toHaveLength(1)
    expect(after.live[0].slot).toBe('DINNER')
  })
})

describe('deleting a meal already in the store', () => {
  it('takes it off the day without removing anything from disk', async () => {
    const repos = await fresh()
    const meal = lunch()
    await repos.meals.add(meal)
    await repos.meals.add(retractMeal(meal, newId))

    const after = await readDay(repos)
    expect(after.live).toHaveLength(0)
    expect(convert(after.totals.energy, 'kcal')).toBe(0)
    expect(after.stored).toHaveLength(2)
  })

  it('undo puts it back, numbers and all', async () => {
    const repos = await fresh()
    const meal = lunch()
    await repos.meals.add(meal)

    const retraction = retractMeal(meal, newId)
    await repos.meals.add(retraction)
    await repos.meals.add(restoreMeal(retraction, newId))

    const after = await readDay(repos)
    expect(after.live).toHaveLength(1)
    expect(convert(after.totals.energy, 'kcal')).toBe(680)
    expect(after.live[0].items).toHaveLength(2)
  })

  it('a deleted meal stays deleted after an edit that preceded it', async () => {
    const repos = await fresh()
    const meal = lunch()
    await repos.meals.add(meal)

    const edited: Meal = applyMealEdit(
      meal,
      { items: liveItems(meal.items).map((item) => scaleTo(editableItem(item), 10)) },
      NOW,
      newId,
    )
    await repos.meals.add(edited)
    await repos.meals.add(retractMeal(edited, newId))

    expect((await readDay(repos)).live).toHaveLength(0)
  })
})

describe('a meal logged from words', () => {
  it('records the description as the evidence, and marks the inference as text', async () => {
    const repos = await fresh()
    const result = await new FakeEstimator().estimateFromText('two eggs on toast', {})
    const { meal, inference } = buildEstimatedMeal(USER, {
      slot: 'BREAKFAST',
      at: new Date('2026-08-26T08:00:00'),
      zone: 'Asia/Jerusalem',
      hints: {},
      source: { kind: 'text', description: 'two eggs on toast' },
      result,
    })
    await repos.inferences.add(inference)
    await repos.meals.add(meal)

    const stored = await repos.inferences.get(inference.id)
    expect(stored!.purpose).toBe('FOOD_TEXT_ESTIMATE')
    expect((stored!.output as { description: string }).description).toBe('two eggs on toast')
    // No photo was taken, so there is no photo hash to point at.
    expect(stored!.inputReferences).toEqual([])

    // It is an estimate like any other: it counts toward the day, arrives
    // unconfirmed, and is settled by the same Confirm flow a photo's is.
    const day = await readDay(repos)
    expect(day.live.map((m) => m.id)).toEqual([meal.id])
    expect(day.live[0].items.every((item) => needsConfirmation(item.provenance))).toBe(true)
    expect(convert(day.totals.energy, 'kcal')).toBeGreaterThan(0)
  })
})
