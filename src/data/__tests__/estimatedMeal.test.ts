import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB, openDB, type IDBPDatabase } from 'idb'
import { createIndexedDbRepositories, seedOnce } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import {
  buildEstimatedMeal,
  buildFailedInference,
  correctionsFrom,
  correctsAnything,
  type EstimateCorrection,
} from '../estimatedMeal'
import { newId } from '../newRecords'
import { goals, meals, observations, profile, sleep, workouts } from '../mock/seed'
import { FakeEstimator, SAMPLE_REPLY } from '@/ai/fakeEstimator'
import { EstimateError, type PhotoMeta } from '@/ai/estimator'
import {
  confirmFoodItem,
  convert,
  detectMealConflicts,
  latestVersions,
  liveItems,
  needsConfirmation,
  nextVersion,
  resolveMealConflict,
  scaleTo,
  type UserId,
} from '@/domain'

const USER = 'user-demo' as UserId
const seed = { profile, meals, workouts, sleep, observations, goals }

const PHOTO: PhotoMeta = { width: 1280, height: 960, bytes: 184_320, sha256: 'a'.repeat(64) }

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

const photoMealInput = (overrides: Partial<Parameters<typeof buildEstimatedMeal>[1]> = {}) => ({
  slot: 'LUNCH' as const,
  at: new Date('2026-08-20T12:30:00'),
  zone: 'Asia/Jerusalem',
  hints: {},
  source: { kind: 'photo' as const, photo: PHOTO },
  ...overrides,
})

describe('photo estimate becomes domain records', () => {
  it('writes a meal whose items are unconfirmed AI estimates linked to the inference', async () => {
    const { repos } = await fresh()
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { meal, inference } = buildEstimatedMeal(USER, { ...photoMealInput(), result })

    await repos.inferences.add(inference)
    await repos.meals.add(meal)

    const [stored] = await repos.meals.listByDay(USER, '2026-08-20')
    expect(stored.items).toHaveLength(2)
    expect(stored.items.every((item) => needsConfirmation(item.provenance))).toBe(true)
    // Every item points back at the audit record.
    expect(stored.items.every((item) => item.provenance.inferenceId === inference.id)).toBe(true)
    // Per-item confidence, not a single flattened figure.
    expect(stored.items.map((i) => i.provenance.confidence)).toEqual([0.72, 0.61])
    expect(convert(stored.items[0].nutrients.protein, 'g')).toBe(53)

    const audit = await repos.inferences.get(inference.id)
    expect(audit?.purpose).toBe('FOOD_PHOTO_ESTIMATE')
    expect(audit?.userConfirmed).toBe(false)
    expect((audit?.output as { raw: unknown }).raw).toEqual(SAMPLE_REPLY)
  })

  it('records what the photo was without keeping the photo', async () => {
    const { repos } = await fresh()
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { inference } = buildEstimatedMeal(USER, { ...photoMealInput(), result })
    await repos.inferences.add(inference)

    const audit = await repos.inferences.get(inference.id)
    const output = audit?.output as { photoMeta: PhotoMeta }
    expect(output.photoMeta).toEqual(PHOTO)
    expect(audit?.inputReferences).toEqual([`photo:${PHOTO.sha256}`])
  })

  it('never sets photoId, because there is no stored attachment', async () => {
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { meal } = buildEstimatedMeal(USER, { ...photoMealInput(), result })
    expect(meal.photoId).toBeUndefined()
  })

  it('honours the grams hint end to end', async () => {
    const result = await new FakeEstimator().estimate(new Blob(), { totalGrams: 900 })
    const { meal } = buildEstimatedMeal(USER, { ...photoMealInput(), hints: { totalGrams: 900 }, result })
    const total = meal.items.reduce((sum, item) => sum + convert(item.amount, 'g'), 0)
    expect(total).toBeCloseTo(900, 6)
  })

  it('lets the slice-1 confirm flow settle an estimate', async () => {
    const { repos } = await fresh()
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { meal } = buildEstimatedMeal(USER, { ...photoMealInput(), result })
    await repos.meals.add(meal)

    const { confirmFoodItem } = await import('@/domain')
    const { newId } = await import('../newRecords')
    const target = meal.items[0]
    const confirmed = confirmFoodItem(target, '2026-08-20T12:40:00.000Z', newId)
    await repos.meals.add({ ...meal, items: [...meal.items, confirmed] })

    const [stored] = await repos.meals.listByDay(USER, '2026-08-20')
    const live = liveItems(stored.items)
    expect(stored.items).toHaveLength(3) // estimate kept for audit
    expect(live).toHaveLength(2) // but superseded, so not double counted
    expect(live.some((item) => item.id === target.id)).toBe(false)
  })
})

describe('meal versioning through storage (D15)', () => {
  it('appends a version instead of overwriting, and shows the newest', async () => {
    const { repos } = await fresh()
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { meal } = buildEstimatedMeal(USER, { ...photoMealInput(), result })
    await repos.meals.add(meal)

    // Confirm an estimate: an item supersedes (D4) inside a new version (D15).
    const estimate = meal.items[0]
    const confirmed = confirmFoodItem(estimate, '2026-08-20T13:00:00.000Z', newId)
    const v2 = nextVersion(meal, { items: [...meal.items, confirmed] }, newId)
    await repos.meals.add(v2)

    const stored = await repos.meals.listByDay(USER, '2026-08-20')
    // Both versions are on disk; nothing was overwritten.
    expect(stored).toHaveLength(2)
    expect(stored.map((m) => m.version).sort()).toEqual([1, 2])

    const latest = latestVersions(stored)
    expect(latest).toHaveLength(1)
    expect(latest[0].version).toBe(2)
    // And within that version, the superseded estimate drops out of the totals.
    expect(liveItems(latest[0].items)).toHaveLength(2)
  })

  it('surfaces a same-version collision written by two devices', async () => {
    const { repos } = await fresh()
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { meal } = buildEstimatedMeal(USER, { ...photoMealInput(), result })
    await repos.meals.add(meal)

    // What sync will produce: two devices editing v1 without seeing each other.
    await repos.meals.add(nextVersion(meal, { slot: 'DINNER' }, () => 'phone-edit'))
    await repos.meals.add(nextVersion(meal, { slot: 'SNACK' }, () => 'laptop-edit'))

    const stored = await repos.meals.listByDay(USER, '2026-08-20')
    expect(stored).toHaveLength(3)

    const conflicts = detectMealConflicts(stored)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].version).toBe(2)

    // Resolving writes v3, which wins without deleting either edit.
    const keep = conflicts[0].candidates.find((c) => c.recordId === 'laptop-edit')!
    await repos.meals.add(resolveMealConflict(keep, conflicts[0], () => 'resolution'))

    const after = await repos.meals.listByDay(USER, '2026-08-20')
    expect(after).toHaveLength(4)
    expect(detectMealConflicts(after)).toEqual([])
    expect(latestVersions(after)[0].slot).toBe('SNACK')
  })
})

describe('failures are audited too', () => {
  it('writes a flagged inference and no meal', async () => {
    const { repos } = await fresh()
    const failure = new EstimateError('BAD_KEY', 'rejected')
    await expect(new FakeEstimator(SAMPLE_REPLY, failure).estimate(new Blob(), {})).rejects.toThrow(
      'rejected',
    )

    const inference = buildFailedInference(USER, {
      at: new Date('2026-08-20T12:30:00'),
      model: 'fake-vision',
      hints: {},
      photo: PHOTO,
      kind: failure.kind,
      message: failure.message,
    })
    await repos.inferences.add(inference)

    expect(await repos.meals.listByDay(USER, '2026-08-20')).toHaveLength(0)
    const audit = await repos.inferences.listByDay(USER, '2026-08-20')
    expect(audit).toHaveLength(1)
    expect(audit[0].safetyFlags).toContain('FAILED_BAD_KEY')
    expect(audit[0].confidence).toBe(0)
  })
})

describe('no image bytes are ever persisted', () => {
  const containsBinary = (value: unknown, depth = 0): boolean => {
    if (depth > 8 || value === null || value === undefined) return false
    if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true
    if (Array.isArray(value)) return value.some((entry) => containsBinary(entry, depth + 1))
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((entry) =>
        containsBinary(entry, depth + 1),
      )
    }
    return false
  }

  it('holds nothing image-shaped after a successful save', async () => {
    const { db, repos } = await fresh()
    await seedOnce(db, seed)
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { meal, inference } = buildEstimatedMeal(USER, { ...photoMealInput(), result })
    await repos.inferences.add(inference)
    await repos.meals.add(meal)

    const database = await db
    // There is deliberately no attachments store at all.
    expect([...database.objectStoreNames]).not.toContain('attachments')
    for (const name of database.objectStoreNames) {
      const rows = await database.getAll(name)
      expect(containsBinary(rows), `store ${name} holds binary data`).toBe(false)
    }
  })

  it('holds nothing image-shaped after a failure either', async () => {
    const { db, repos } = await fresh()
    await repos.inferences.add(
      buildFailedInference(USER, {
        at: new Date('2026-08-20T12:30:00'),
        model: 'fake-vision',
        hints: { foodName: 'salad' },
        photo: PHOTO,
        kind: 'UNREADABLE',
        message: 'nope',
      }),
    )
    const database = await db
    for (const name of database.objectStoreNames) {
      expect(containsBinary(await database.getAll(name))).toBe(false)
    }
  })
})

describe('settings', () => {
  it('round-trips the API key and defaults sensibly', async () => {
    const { repos } = await fresh()
    const defaults = await repos.settings.get()
    expect(defaults.apiKey).toBeUndefined()
    expect(defaults.autoAnalyze).toBe(true)
    expect(defaults.model).toBeTruthy()

    await repos.settings.save({ apiKey: 'sk-test-123', autoAnalyze: false })
    const saved = await repos.settings.get()
    expect(saved.apiKey).toBe('sk-test-123')
    expect(saved.autoAnalyze).toBe(false)
  })

  it('remembers the analysis preferences', async () => {
    const { repos } = await fresh()
    expect((await repos.settings.get()).autoAnalyze).toBe(true)

    await repos.settings.save({ autoAnalyze: false, model: 'gpt-4o-mini' })
    const saved = await repos.settings.get()
    expect(saved.autoAnalyze).toBe(false)
    expect(saved.model).toBe('gpt-4o-mini')
  })

  it('clears the key when it is emptied', async () => {
    const { repos } = await fresh()
    await repos.settings.save({ apiKey: 'sk-test-123' })
    await repos.settings.save({ apiKey: '' })
    expect((await repos.settings.get()).apiKey).toBeUndefined()
  })
})

describe('migrating a slice-1 database forward', () => {
  it('reaches v3, adds the new stores, and rekeys meals without losing them', async () => {
    // Build a database exactly as slice 1 left it.
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        for (const name of ['meals', 'workouts', 'sleep', 'observations', 'goals', 'labPanels', 'conditions', 'regimens', 'intakeEvents']) {
          const store = db.createObjectStore(name, { keyPath: 'id' })
          store.createIndex('by-user-day', ['userId', 'day'])
          if (name === 'observations') store.createIndex('by-user-code', ['userId', 'code'])
        }
        db.createObjectStore('profiles', { keyPath: 'userId' })
        db.createObjectStore('meta', { keyPath: 'key' })
      },
    })
    await v1.put('meals', {
      id: 'meal-from-v1',
      userId: USER,
      day: '2026-08-19',
      data: {
        id: 'meal-from-v1',
        userId: USER,
        slot: 'DINNER',
        // No version/recordId: this is what slice 1 actually wrote.
        time: { kind: 'instant', at: '2026-08-19T17:00:00.000Z', zone: 'Asia/Jerusalem' },
        items: [],
        provenance: { source: 'USER', kind: 'RAW', recordedAt: '2026-08-19T17:00:00.000Z' },
      },
    })
    v1.close()

    // Open at v2.
    const { repos } = await fresh()
    const database = await openConnection!
    expect(database.version).toBe(3)
    expect([...database.objectStoreNames]).toContain('inferences')
    expect([...database.objectStoreNames]).toContain('settings')

    // The v3 migration REWRITES meal rows rather than just adding a store, so
    // this is the first upgrade that could actually lose data.
    const survived = await repos.meals.listByDay(USER, '2026-08-19')
    expect(survived).toHaveLength(1)
    expect(survived[0].id).toBe('meal-from-v1')
    // Everything logged before versioning existed is version 1.
    expect(survived[0].version).toBe(1)
    expect(survived[0].recordId).toBeTruthy()

    // And the store is now keyed by version, so an edit can be appended.
    const edited = { ...survived[0], recordId: 'v2-record', version: 2, slot: 'LUNCH' as const }
    await repos.meals.add(edited)
    const both = await repos.meals.listByDay(USER, '2026-08-19')
    expect(both).toHaveLength(2)
    expect(latestVersions(both)[0].slot).toBe('LUNCH')
  })
})

describe('correcting an estimate before it is saved', () => {
  const corrected = async (edit: Partial<EstimateCorrection> & { index: number }) => {
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const rows = correctionsFrom(result)
    const corrections = rows.map((row) =>
      row.index === edit.index ? { ...row, ...edit } : row,
    )
    return { result, ...buildEstimatedMeal(USER, { ...photoMealInput(), result, corrections }) }
  }

  it('seeds the form with exactly what the model said', async () => {
    const result = await new FakeEstimator().estimate(new Blob(), {})
    expect(correctionsFrom(result)).toEqual([
      { index: 0, name: 'Grilled chicken breast', amountG: 170, energyKcal: 281, proteinG: 53, carbsG: 0, fatG: 6 },
      { index: 1, name: 'Rice and vegetables', amountG: 280, energyKcal: 430, proteinG: 11, carbsG: 86, fatG: 5 },
    ])
  })

  it('leaves an untouched estimate exactly as it was', async () => {
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const rows = correctionsFrom(result)
    expect(correctsAnything(result, rows)).toBe(false)

    const { meal } = buildEstimatedMeal(USER, { ...photoMealInput(), result, corrections: rows })
    expect(meal.items.every((item) => needsConfirmation(item.provenance))).toBe(true)
    expect(meal.items.map((i) => convert(i.amount, 'g'))).toEqual([170, 280])
  })

  it('re-portions by ratio, and the corrected item becomes the user\'s own figure', async () => {
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const halved = scaleTo(correctionsFrom(result)[0], 85)
    expect(halved).toMatchObject({ amountG: 85, energyKcal: 140.5, proteinG: 26.5, fatG: 3 })

    const { meal } = await corrected(halved)
    const [chicken, rice] = meal.items
    // Corrected: a human said what this should be, so it needs no confirming.
    expect(needsConfirmation(chicken.provenance)).toBe(false)
    expect(chicken.provenance.source).toBe('USER')
    expect(convert(chicken.nutrients.protein, 'g')).toBe(26.5)
    // Untouched: still the model's guess, still awaiting confirmation.
    expect(needsConfirmation(rice.provenance)).toBe(true)
    expect(rice.provenance.source).toBe('AI_ESTIMATE')
  })

  it('drops a food the user removed, and keeps the rest estimated', async () => {
    const { meal } = await corrected({ index: 1, removed: true })
    expect(meal.items).toHaveLength(1)
    expect(meal.items[0].name).toBe('Grilled chicken breast')
    expect(needsConfirmation(meal.items[0].provenance)).toBe(true)
  })

  it('renaming a food is a correction too', async () => {
    const { meal } = await corrected({ index: 0, name: 'Chicken thigh' })
    expect(meal.items[0].name).toBe('Chicken thigh')
    expect(meal.items[0].provenance.source).toBe('USER')
  })

  it('records the overrides in the audit trail beside what the model said', async () => {
    const { result, inference } = await corrected({ index: 0, energyKcal: 200 })
    const output = inference.output as { raw: unknown; corrections?: EstimateCorrection[] }
    // The model's own words are untouched...
    expect(output.raw).toEqual(SAMPLE_REPLY)
    expect(result.items[0].energyKcal).toBe(281)
    // ...and what the human changed them to is recorded next to it.
    expect(output.corrections?.[0]).toMatchObject({ index: 0, energyKcal: 200 })
  })

  it('does not clutter the audit row when nothing was actually changed', async () => {
    const result = await new FakeEstimator().estimate(new Blob(), {})
    const { inference } = buildEstimatedMeal(USER, {
      ...photoMealInput(),
      result,
      corrections: correctionsFrom(result),
    })
    expect(inference.output).not.toHaveProperty('corrections')
  })

  it('keeps the meal itself an estimate, because that is how it began', async () => {
    const { meal } = await corrected({ index: 0, energyKcal: 200 })
    expect(meal.provenance.source).toBe('AI_ESTIMATE')
  })
})
