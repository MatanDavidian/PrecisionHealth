import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { buildLeftoverMeal, plateOf, previewLeftover } from '../leftoverMeal'
import {
  canonical,
  convert,
  liveItems,
  needsConfirmation,
  userEntered,
  type FoodItem,
  type FoodItemId,
  type LeftoverEstimate,
  type Meal,
  type MealId,
  type UserId,
} from '@/domain'

const USER = 'user-demo' as UserId
const AT = '2026-08-30T07:20:00.000Z'

const item = (name: string, g: number, kcal: number): FoodItem => ({
  id: `food-${name}` as FoodItemId,
  mealId: 'meal-1' as MealId,
  name,
  amount: canonical(g, 'g'),
  nutrients: {
    energy: canonical(kcal, 'kcal'),
    protein: canonical(g / 10, 'g'),
    carbs: canonical(g / 5, 'g'),
    fat: canonical(g / 20, 'g'),
  },
  provenance: userEntered(AT),
})

const meal = (): Meal => ({
  id: 'meal-1' as MealId,
  recordId: 'rec-1',
  version: 1,
  userId: USER,
  slot: 'BREAKFAST',
  time: { kind: 'instant', at: AT, zone: 'Asia/Jerusalem' },
  items: [item('eggs', 200, 400), item('toast', 100, 300)],
  provenance: userEntered(AT),
})

const estimate: LeftoverEstimate = {
  portions: [
    { index: 0, eatenFraction: 1, note: 'fully eaten' },
    { index: 1, eatenFraction: 0.5, note: 'about half eaten' },
  ],
  model: 'fake-1',
  confidence: 0.72,
}

describe('recording what came back on the plate', () => {
  it('shows the plate to the model in order, with weights', () => {
    expect(plateOf(meal())).toEqual([
      { name: 'eggs', amountG: 200 },
      { name: 'toast', amountG: 100 },
    ])
  })

  it('previews the share eaten before anything is written', () => {
    const preview = previewLeftover(meal(), estimate)
    // 400 kcal of eggs plus 150 of toast, from 700.
    expect(preview.eaten).toBeCloseTo(0.7857, 3)
    expect(preview.rows[1]).toMatchObject({ name: 'toast', eatenFraction: 0.5 })
    expect(preview.changesAnything).toBe(true)
  })

  it('writes a new version and leaves the original readable (D15)', () => {
    const before = meal()
    const { meal: next } = buildLeftoverMeal(USER, before, estimate, { kind: 'text', description: 'half the toast' })
    expect(next.version).toBe(2)
    expect(next.recordId).not.toBe(before.recordId)
    expect(before.items).toHaveLength(2)
  })

  it('supersedes only the food that actually changed', () => {
    const { meal: next } = buildLeftoverMeal(USER, meal(), estimate, { kind: 'text', description: 'x' })
    const live = liveItems(next.items)
    expect(live).toHaveLength(2)
    const toast = live.find((i) => i.name === 'toast')!
    const eggs = live.find((i) => i.name === 'eggs')!
    expect(convert(toast.amount, 'g')).toBe(50)
    // Eggs were fully eaten, so no new record for them at all.
    expect(eggs.id).toBe('food-eggs')
    expect(toast.provenance.supersedes).toEqual(['food-toast'])
  })

  it('marks the scaled food as a model estimate, needing confirmation', () => {
    const { meal: next, inference } = buildLeftoverMeal(USER, meal(), estimate, {
      kind: 'photo',
      sha256: 'abc',
    })
    const toast = liveItems(next.items).find((i) => i.name === 'toast')!
    // The person supplied the evidence; the model supplied the numbers. The
    // app must not claim they checked them.
    expect(toast.provenance.source).toBe('AI_ESTIMATE')
    expect(needsConfirmation(toast.provenance)).toBe(true)
    expect(toast.provenance.inferenceId).toBe(inference.id)
  })

  it('keeps an audit row that can answer for the claim (D13)', () => {
    const { inference } = buildLeftoverMeal(USER, meal(), estimate, { kind: 'photo', sha256: 'abc' })
    expect(inference.purpose).toBe('FOOD_LEFTOVER_ESTIMATE')
    expect(inference.inputReferences).toContain('meal:meal-1')
    // The photo is not stored; its hash stands in for it.
    expect(inference.inputReferences).toContain('photo:abc')
    expect(inference.output).toMatchObject({ portions: estimate.portions })
  })

  it('writes nothing when the whole meal was eaten', () => {
    const all: LeftoverEstimate = { ...estimate, portions: [{ index: 0, eatenFraction: 1 }] }
    const { meal: next } = buildLeftoverMeal(USER, meal(), all, { kind: 'text', description: 'all of it' })
    expect(liveItems(next.items).map((i) => i.id)).toEqual(['food-eggs', 'food-toast'])
    expect(previewLeftover(meal(), all).changesAnything).toBe(false)
  })

  it('does not touch what the model never mentioned', () => {
    const onlyToast: LeftoverEstimate = { ...estimate, portions: [{ index: 1, eatenFraction: 0.5 }] }
    const { meal: next } = buildLeftoverMeal(USER, meal(), onlyToast, { kind: 'text', description: 'x' })
    const eggs = liveItems(next.items).find((i) => i.name === 'eggs')!
    expect(convert(eggs.amount, 'g'), 'an unmentioned food must not shrink').toBe(200)
    expect(eggs.provenance).toEqual(userEntered(AT))
  })
})
