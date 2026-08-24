import { describe, expect, it } from 'vitest'
import {
  findUsualFoods,
  findUsualMeals,
  mealFromFoods,
  mealSignature,
  repeatMeal,
} from '../usuals'
import { retractMeal, latestVersions } from '../mealVersions'
import {
  aiEstimate,
  canonical,
  confirmFoodItem,
  userEntered,
  type AIInferenceId,
  type FoodItem,
  type Meal,
  type MealId,
  type MealSlot,
  type UserId,
} from '../index'

const USER = 'u' as UserId
const ZONE = 'Asia/Jerusalem'
let n = 0
const newId = () => `gen-${++n}`

const food = (name: string, kcal = 200, provenance = userEntered('2026-08-20T07:00:00.000Z')): FoodItem => ({
  id: `item-${name}-${++n}` as FoodItem['id'],
  mealId: 'm' as MealId,
  name,
  amount: canonical(100, 'g'),
  nutrients: {
    energy: canonical(kcal, 'kcal'),
    protein: canonical(10, 'g'),
    carbs: canonical(20, 'g'),
    fat: canonical(5, 'g'),
  },
  provenance,
})

const meal = (day: string, slot: MealSlot, names: string[], kcal = 200): Meal => ({
  id: `meal-${day}-${slot}` as MealId,
  recordId: `rec-${day}-${slot}`,
  version: 1,
  userId: USER,
  slot,
  time: { kind: 'instant', at: `${day}T07:00:00.000Z`, zone: ZONE },
  items: names.map((name) => food(name, kcal)),
  provenance: userEntered(`${day}T07:00:00.000Z`),
})

describe('recognising the same meal again', () => {
  it('ignores order and capitals', () => {
    expect(mealSignature(meal('2026-08-20', 'BREAKFAST', ['Eggs', 'Oats']))).toBe(
      mealSignature(meal('2026-08-21', 'BREAKFAST', ['oats', 'EGGS'])),
    )
  })

  it('treats a different set of foods as a different meal', () => {
    expect(mealSignature(meal('2026-08-20', 'BREAKFAST', ['Eggs', 'Oats']))).not.toBe(
      mealSignature(meal('2026-08-20', 'BREAKFAST', ['Eggs'])),
    )
  })
})

describe('what to offer back', () => {
  const history = [
    meal('2026-08-18', 'BREAKFAST', ['Eggs', 'Oats']),
    meal('2026-08-19', 'BREAKFAST', ['Eggs', 'Oats']),
    meal('2026-08-20', 'BREAKFAST', ['Eggs', 'Oats']),
    meal('2026-08-19', 'BREAKFAST', ['Skyr', 'Berries']),
    meal('2026-08-20', 'LUNCH', ['Chicken', 'Rice']),
  ]

  it('ranks by how often, then how recently', () => {
    const usuals = findUsualMeals(history, { slot: 'BREAKFAST' })
    expect(usuals.map((u) => u.count)).toEqual([3, 1])
    expect(usuals[0].signature).toBe('eggs + oats')
  })

  it('only offers meals for the slot being logged', () => {
    // At breakfast time, yesterday's chicken and rice is not a suggestion.
    const breakfast = findUsualMeals(history, { slot: 'BREAKFAST' })
    expect(breakfast.some((u) => u.signature.includes('chicken'))).toBe(false)
    expect(findUsualMeals(history, { slot: 'LUNCH' })).toHaveLength(1)
  })

  it('files a meal under the slot it is USUALLY eaten at', () => {
    // Eaten at breakfast three times and once, oddly, at midnight.
    const odd = [...history, meal('2026-08-21', 'NIGHT', ['Eggs', 'Oats'])]
    const usuals = findUsualMeals(odd, { slot: 'BREAKFAST' })
    expect(usuals[0].count).toBe(4)
    expect(usuals[0].slot).toBe('BREAKFAST')
  })

  it('copies from the most recent instance', () => {
    const usuals = findUsualMeals(history, { slot: 'BREAKFAST' })
    expect(usuals[0].template.recordId).toBe('rec-2026-08-20-BREAKFAST')
  })

  it('never offers a meal that was taken back', () => {
    const logged = meal('2026-08-20', 'SNACK', ['Crisps'])
    const undone = retractMeal(logged, newId)
    // The retraction is what a reader sees, and it is not a usual.
    const visible = latestVersions([logged, undone])
    expect(visible).toEqual([])
    expect(findUsualMeals([undone], { slot: 'SNACK' })).toEqual([])
  })

  it('surfaces single foods separately, since a snack combines them', () => {
    const foods = findUsualFoods([
      meal('2026-08-18', 'SNACK', ['Banana']),
      meal('2026-08-19', 'SNACK', ['Banana']),
      meal('2026-08-20', 'SNACK', ['Apple']),
    ])
    expect(foods.map((f) => [f.name, f.count])).toEqual([
      ['Banana', 2],
      ['Apple', 1],
    ])
  })
})

describe('logging a repeat', () => {
  const template = meal('2026-08-20', 'BREAKFAST', ['Eggs', 'Oats'])

  it('creates a fresh meal at the time it is logged', () => {
    const at = new Date('2026-08-22T07:42:00.000Z')
    const repeated = repeatMeal(template, USER, { at, zone: ZONE, slot: 'BREAKFAST', newId })

    expect(repeated.version).toBe(1)
    expect(repeated.id).not.toBe(template.id)
    expect(repeated.items).toHaveLength(2)
    expect(repeated.time).toEqual({ kind: 'instant', at: at.toISOString(), zone: ZONE })
    // Items belong to the new meal, not the one they were copied from.
    expect(repeated.items.every((item) => item.mealId === repeated.id)).toBe(true)
  })

  it('carries the numbers over, so nothing needs re-estimating', () => {
    const repeated = repeatMeal(template, USER, {
      at: new Date('2026-08-22T07:42:00.000Z'),
      zone: ZONE,
      slot: 'BREAKFAST',
      newId,
    })
    expect(repeated.items[0].nutrients.energy.value).toBe(200)
    expect(repeated.items[0].amount.value).toBe(100)
  })

  it('does not launder an unconfirmed guess into a fact', () => {
    // A meal whose numbers an AI produced and nobody ever checked.
    const guessed: Meal = {
      ...template,
      items: [food('Mystery stew', 400, aiEstimate('2026-08-20T07:00:00.000Z', 0.4, 'inf-1' as AIInferenceId))],
    }
    const repeated = repeatMeal(guessed, USER, {
      at: new Date('2026-08-22T07:42:00.000Z'),
      zone: ZONE,
      slot: 'BREAKFAST',
      newId,
    })

    // Repeating asserts you ate it again. It does not assert the number is right.
    expect(repeated.items[0].provenance.source).toBe('AI_ESTIMATE')
    expect(repeated.items[0].provenance.confidence).toBe(0.4)
    // And it still points at the inference the number actually came from.
    expect(repeated.items[0].provenance.inferenceId).toBe('inf-1')
  })

  it('turns a reviewed number into a plain user entry', () => {
    const confirmed = confirmFoodItem(
      food('Eggs', 200, aiEstimate('2026-08-20T07:00:00.000Z', 0.8, 'inf-2' as AIInferenceId)),
      '2026-08-20T08:00:00.000Z',
      newId,
    )
    const repeated = repeatMeal({ ...template, items: [confirmed] }, USER, {
      at: new Date('2026-08-22T07:42:00.000Z'),
      zone: ZONE,
      slot: 'BREAKFAST',
      newId,
    })
    expect(repeated.items[0].provenance.source).toBe('USER')
    expect(repeated.items[0].provenance.kind).toBe('RAW')
  })

  it('builds one meal from several chosen foods', () => {
    const foods = findUsualFoods([
      meal('2026-08-19', 'SNACK', ['Banana'], 105),
      meal('2026-08-20', 'SNACK', ['Coffee'], 40),
    ])
    const combined = mealFromFoods(foods, USER, {
      at: new Date('2026-08-22T16:00:00.000Z'),
      zone: ZONE,
      slot: 'SNACK',
      newId,
    })
    expect(combined.items.map((i) => i.name).sort()).toEqual(['Banana', 'Coffee'])
    expect(combined.slot).toBe('SNACK')
  })
})
