import { describe, expect, it } from 'vitest'
import {
  aiEstimate,
  applyMealEdit,
  canonical,
  changesAnything,
  convert,
  editableItem,
  latestVersions,
  liveItems,
  needsConfirmation,
  restoreMeal,
  retractMeal,
  scaleTo,
  userEntered,
  type AIInferenceId,
  type FoodItem,
  type FoodItemId,
  type Meal,
  type MealId,
  type UserId,
} from '../index'

let counter = 0
const newId = () => `generated-${++counter}`
const AT = '2026-08-26T12:00:00.000Z'
const LATER = '2026-08-26T13:00:00.000Z'

const item = (name: string, overrides: Partial<FoodItem> = {}): FoodItem => ({
  id: `item-${name}` as FoodItemId,
  mealId: 'lunch' as MealId,
  name,
  amount: canonical(200, 'g'),
  nutrients: {
    energy: canonical(400, 'kcal'),
    protein: canonical(30, 'g'),
    carbs: canonical(40, 'g'),
    fat: canonical(10, 'g'),
  },
  provenance: userEntered(AT),
  ...overrides,
})

const meal = (items: FoodItem[] = [item('rice')]): Meal => ({
  id: 'lunch' as MealId,
  recordId: 'record-1',
  version: 1,
  userId: 'u' as UserId,
  slot: 'LUNCH',
  time: { kind: 'instant', at: AT, zone: 'Asia/Jerusalem' },
  items,
  provenance: userEntered(AT),
})

const edited = (source: Meal, patch: Partial<ReturnType<typeof editableItem>> = {}) => ({
  items: liveItems(source.items).map((i) => ({ ...editableItem(i), ...patch })),
})

describe('re-portioning by weight', () => {
  it('scales every macro by the same ratio', () => {
    const scaled = scaleTo(editableItem(item('rice')), 100)
    expect(scaled).toMatchObject({ amountG: 100, energyKcal: 200, proteinG: 15, carbsG: 20, fatG: 5 })
  })

  it("leaves a weightless item's numbers alone rather than zeroing them", () => {
    const weightless = editableItem(item('oil', { amount: canonical(0, 'g') }))
    expect(scaleTo(weightless, 15)).toMatchObject({ amountG: 15, energyKcal: 400 })
  })
})

describe('editing a logged meal', () => {
  it('writes the next version and leaves the original untouched', () => {
    const original = meal()
    const next = applyMealEdit(original, edited(original, { amountG: 100 }), LATER, newId)

    expect(next.version).toBe(2)
    expect(next.id).toBe(original.id)
    expect(next.recordId).not.toBe(original.recordId)
    expect(original.items).toHaveLength(1)
    expect(convert(original.items[0].amount, 'g')).toBe(200)
  })

  it('supersedes the old item rather than replacing it', () => {
    const original = meal()
    const next = applyMealEdit(original, edited(original, { amountG: 100 }), LATER, newId)

    // Both records are in the array; only the correction is live.
    expect(next.items).toHaveLength(2)
    const live = liveItems(next.items)
    expect(live).toHaveLength(1)
    expect(convert(live[0].amount, 'g')).toBe(100)
    expect(live[0].provenance.supersedes).toEqual([original.items[0].id])
  })

  it('makes a corrected AI estimate confirmed — a human said what it should be', () => {
    const estimate = item('rice', {
      provenance: aiEstimate(AT, 0.6, 'inference-1' as AIInferenceId),
    })
    const original = meal([estimate])
    expect(needsConfirmation(original.items[0].provenance)).toBe(true)

    const next = applyMealEdit(original, edited(original, { amountG: 150 }), LATER, newId)
    expect(needsConfirmation(liveItems(next.items)[0].provenance)).toBe(false)
  })

  it('leaves untouched items exactly as they were', () => {
    const original = meal([item('rice'), item('chicken')])
    const next = applyMealEdit(
      original,
      { items: liveItems(original.items).map((i) => editableItem(i)) },
      LATER,
      newId,
    )
    expect(next.items).toEqual(original.items)
  })

  it('carries a slot and time change onto the new version', () => {
    const original = meal()
    const next = applyMealEdit(
      original,
      { ...edited(original), slot: 'DINNER', at: LATER },
      LATER,
      newId,
    )
    expect(next.slot).toBe('DINNER')
    expect(next.time).toEqual({ kind: 'instant', at: LATER, zone: 'Asia/Jerusalem' })
  })

  it('keeps the meal-level provenance, so "this began as a photo" survives an edit', () => {
    const original = meal()
    const photo = { ...original, provenance: aiEstimate(AT, 0.7, 'inference-1' as AIInferenceId) }
    const next = applyMealEdit(photo, edited(photo, { amountG: 100 }), LATER, newId)
    expect(next.provenance).toEqual(photo.provenance)
  })
})

describe('removing a food from a meal', () => {
  it('drops it from the next version', () => {
    const original = meal([item('rice'), item('chicken')])
    const next = applyMealEdit(
      original,
      { items: [], removed: [original.items[0].id] },
      LATER,
      newId,
    )
    expect(liveItems(next.items).map((i) => i.name)).toEqual(['chicken'])
  })

  it("takes the item's whole correction chain with it, so nothing comes back to life", () => {
    const original = meal()
    const corrected = applyMealEdit(original, edited(original, { amountG: 100 }), LATER, newId)
    const live = liveItems(corrected.items)[0]

    const next = applyMealEdit(corrected, { items: [], removed: [live.id] }, LATER, newId)
    expect(liveItems(next.items)).toHaveLength(0)
    expect(next.items).toHaveLength(0)
  })
})

describe('knowing whether to write at all', () => {
  it('is false when the form was opened and saved unchanged', () => {
    const original = meal()
    expect(changesAnything(original, edited(original))).toBe(false)
  })

  it('is true for any real change', () => {
    const original = meal()
    expect(changesAnything(original, edited(original, { amountG: 199 }))).toBe(true)
    expect(changesAnything(original, { ...edited(original), slot: 'DINNER' })).toBe(true)
    expect(
      changesAnything(original, { items: [], removed: [original.items[0].id] }),
    ).toBe(true)
  })
})

describe('deleting and undeleting', () => {
  it('takes the meal out of the day, then puts it back', () => {
    const original = meal()
    const deleted = retractMeal(original, newId)
    expect(latestVersions([original, deleted])).toHaveLength(0)

    const restored = restoreMeal(deleted, newId)
    expect(restored.version).toBe(3)
    expect(latestVersions([original, deleted, restored])).toHaveLength(1)
    expect(liveItems(latestVersions([original, deleted, restored])[0].items)).toHaveLength(1)
  })
})
