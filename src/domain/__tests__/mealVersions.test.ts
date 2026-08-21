import { describe, expect, it } from 'vitest'
import {
  detectMealConflicts,
  latestVersions,
  nextVersion,
  resolveMealConflict,
} from '../mealVersions'
import { canonical, userEntered, type FoodItem, type Meal, type MealId, type UserId } from '../index'

let counter = 0
const newId = () => `generated-${++counter}`

const item = (name: string): FoodItem => ({
  id: `item-${name}` as FoodItem['id'],
  mealId: 'lunch' as MealId,
  name,
  amount: canonical(100, 'g'),
  nutrients: {
    energy: canonical(200, 'kcal'),
    protein: canonical(10, 'g'),
    carbs: canonical(20, 'g'),
    fat: canonical(5, 'g'),
  },
  provenance: userEntered('2026-08-21T12:00:00.000Z'),
})

const meal = (version: number, recordId: string, names: string[] = ['rice']): Meal => ({
  id: 'lunch' as MealId,
  recordId,
  version,
  userId: 'u' as UserId,
  slot: 'LUNCH',
  time: { kind: 'instant', at: '2026-08-21T12:00:00.000Z', zone: 'Asia/Jerusalem' },
  items: names.map(item),
  provenance: userEntered('2026-08-21T12:00:00.000Z'),
})

describe('reading versioned meals', () => {
  it('shows the newest version of a meal', () => {
    const history = [meal(1, 'a'), meal(3, 'c'), meal(2, 'b')]
    const latest = latestVersions(history)
    expect(latest).toHaveLength(1)
    expect(latest[0].recordId).toBe('c')
  })

  it('keeps different meals apart', () => {
    const other: Meal = { ...meal(1, 'x'), id: 'dinner' as MealId }
    expect(latestVersions([meal(2, 'b'), other]).map((m) => m.id).sort()).toEqual([
      'dinner',
      'lunch',
    ])
  })

  it('returns nothing for nothing', () => {
    expect(latestVersions([])).toEqual([])
  })
})

describe('editing appends rather than overwrites', () => {
  it('produces a new record at the next version, leaving the original alone', () => {
    const original = meal(1, 'a')
    const edited = nextVersion(original, { items: [item('rice'), item('chicken')] }, newId)

    expect(edited.version).toBe(2)
    expect(edited.recordId).not.toBe(original.recordId)
    expect(edited.id).toBe(original.id) // same meal
    expect(edited.items).toHaveLength(2)
    // The record we edited is untouched — that is the whole point.
    expect(original.version).toBe(1)
    expect(original.items).toHaveLength(1)
  })

  it('keeps the full history readable while showing only the latest', () => {
    const v1 = meal(1, 'a', ['rice'])
    const v2 = nextVersion(v1, { items: [item('rice'), item('chicken')] }, newId)
    const history = [v1, v2]

    expect(history).toHaveLength(2)
    expect(latestVersions(history)[0].items).toHaveLength(2)
  })
})

describe('same-version collisions are conflicts', () => {
  it('stays quiet when versions are ordered', () => {
    expect(detectMealConflicts([meal(1, 'a'), meal(2, 'b')])).toEqual([])
  })

  it('raises a conflict when two devices edit the same base', () => {
    // Both started from v1 and wrote v2 without seeing each other.
    const phone = meal(2, 'phone', ['rice', 'chicken'])
    const laptop = meal(2, 'laptop', ['rice', 'fish'])
    const conflicts = detectMealConflicts([meal(1, 'a'), phone, laptop])

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].version).toBe(2)
    expect(conflicts[0].candidates.map((c) => c.recordId).sort()).toEqual(['laptop', 'phone'])
  })

  it('is not fooled by the same record arriving twice', () => {
    // Sync can deliver one record from two directions; that is not a disagreement.
    const same = meal(2, 'phone')
    expect(detectMealConflicts([same, { ...same }])).toEqual([])
  })

  it('only reports the top version, not older resolved ones', () => {
    const conflicts = detectMealConflicts([
      meal(2, 'phone'),
      meal(2, 'laptop'),
      meal(3, 'resolved'), // someone already settled it
    ])
    expect(conflicts).toEqual([])
  })
})

describe('resolving a meal conflict', () => {
  it('writes the choice as the next version, so it wins by the ordinary read rule', () => {
    const phone = meal(2, 'phone', ['rice', 'chicken'])
    const laptop = meal(2, 'laptop', ['rice', 'fish'])
    const history = [meal(1, 'a'), phone, laptop]
    const conflict = detectMealConflicts(history)[0]

    const resolution = resolveMealConflict(laptop, conflict, newId)
    expect(resolution.version).toBe(3)
    expect(resolution.items.map((i) => i.name)).toEqual(['rice', 'fish'])

    const settled = [...history, resolution]
    expect(latestVersions(settled)[0].recordId).toBe(resolution.recordId)
    // And the conflict is gone, without deleting either candidate.
    expect(detectMealConflicts(settled)).toEqual([])
    expect(settled).toHaveLength(4)
  })
})
