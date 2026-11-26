import { describe, expect, it } from 'vitest'
import {
  buildSuggestionRequest,
  fitOf,
  hasRoom,
  leftOf,
  MAX_NOTE_CHARS,
  MAX_USUAL_FOODS,
  totalsOf,
  type SuggestionInput,
} from '../suggestions'
import { dayProgress, type DailyTargets } from '../targets'
import { canonical, userEntered, type FoodItem, type Meal, type MealId, type MealSlot, type UserId } from '../index'

const USER = '03272ea5-0000-4000-8000-000000000000' as UserId
const ZONE = 'Asia/Jerusalem'
let n = 0

const targets: DailyTargets = {
  objective: 'LOSE_FAT',
  choice: { aim: 'LOSE', focus: ['FAT'] },
  energyKcal: 2150,
  proteinG: 140,
  carbsG: 215,
  fatG: 72,
  balanceKcal: -350,
  energy: { from: 'RULE' },
  floored: false,
  belowFloor: false,
  protein: { from: 'RULE', perKg: 2, weightKg: 70 },
}

/** A food with its numbers for its amount: cottage cheese is 250 g, 250 kcal. */
const food = (name: string, grams: number, kcal: number, protein: number, carbs = 5, fat = 5): FoodItem => ({
  id: `item-${++n}` as FoodItem['id'],
  mealId: 'm' as MealId,
  name,
  amount: canonical(grams, 'g'),
  nutrients: {
    energy: canonical(kcal, 'kcal'),
    protein: canonical(protein, 'g'),
    carbs: canonical(carbs, 'g'),
    fat: canonical(fat, 'g'),
  },
  provenance: userEntered('2026-11-20T18:00:00.000Z'),
})

const meal = (day: string, slot: MealSlot, items: FoodItem[]): Meal => ({
  id: `meal-${++n}` as MealId,
  recordId: `rec-${n}`,
  version: 1,
  userId: USER,
  slot,
  time: { kind: 'instant', at: `${day}T18:00:00.000Z`, zone: ZONE },
  items,
  provenance: userEntered(`${day}T18:00:00.000Z`),
})

const cottage = () => food('Cottage cheese 5%', 250, 250, 27.5, 8, 12.5)
const cucumber = () => food('Cucumber', 150, 23, 1, 4, 0)
const tuna = () => food('Tuna in water', 112, 116, 26, 0, 1)

const history: Meal[] = [
  meal('2026-11-20', 'SNACK', [cottage(), cucumber()]),
  meal('2026-11-21', 'SNACK', [cottage(), cucumber()]),
  meal('2026-11-22', 'SNACK', [cottage(), cucumber()]),
  meal('2026-11-23', 'LUNCH', [tuna()]),
  meal('2026-11-24', 'LUNCH', [tuna()]),
]
const today: Meal[] = [meal('2026-11-26', 'BREAKFAST', [food('Eggs', 120, 180, 15, 1, 12)])]

const input = (over: Partial<SuggestionInput> = {}): SuggestionInput => ({
  slot: 'DINNER',
  localTime: '20:40',
  targets,
  eaten: { energyKcal: 1850, proteinG: 102, carbsG: 190, fatG: 63 },
  history: [...history, ...today],
  today,
  ...over,
})

describe('whether to offer suggestions', () => {
  const progress = (energyKcal: number, proteinG: number) =>
    dayProgress(targets, { energyKcal, proteinG, carbsG: 100, fatG: 40 })

  it('offers them with calories to spare', () => {
    expect(hasRoom(progress(1850, 140))).toBe(true)
  })

  it('offers them on target when protein is well short', () => {
    expect(hasRoom(progress(2130, 120))).toBe(true)
  })

  it('does not when the day is full: on target with protein reached, or over', () => {
    expect(hasRoom(progress(2130, 140))).toBe(false)
    expect(hasRoom(progress(2400, 90))).toBe(false)
  })

  it('says what is left, never below zero', () => {
    expect(leftOf(dayProgress(targets, { energyKcal: 1850, proteinG: 102, carbsG: 230, fatG: 63 }))).toEqual({
      energyKcal: 300,
      proteinG: 38,
      carbsG: 0,
      fatG: 9,
    })
  })
})

describe('the request', () => {
  it('carries what is left, the slot, the time and the goal', () => {
    const request = buildSuggestionRequest(input())
    expect(request.left).toEqual({ energyKcal: 300, proteinG: 38, carbsG: 25, fatG: 9 })
    expect(request.slot).toBe('DINNER')
    expect(request.localTime).toBe('20:40')
    expect(request.goal).toEqual({ aim: 'LOSE', focus: ['FAT'], objective: 'LOSE_FAT' })
  })

  it('lists usual meals of more than one food, with their foods and totals', () => {
    const [usual] = buildSuggestionRequest(input()).usualMeals
    expect(usual).toEqual({
      name: 'Cottage cheese 5%, Cucumber',
      foods: [
        { name: 'Cottage cheese 5%', grams: 250 },
        { name: 'Cucumber', grams: 150 },
      ],
      kcal: 273,
      proteinG: 28.5,
      carbsG: 12,
      fatG: 12.5,
      timesLogged: 3,
      usualSlot: 'SNACK',
    })
    // The tuna on its own is a usual food, not a meal.
    expect(buildSuggestionRequest(input()).usualMeals).toHaveLength(1)
  })

  it('lists usual foods with their usual amount and numbers per 100 g', () => {
    const foods = buildSuggestionRequest(input()).usualFoods
    expect(foods.find((f) => f.name === 'Cottage cheese 5%')).toEqual({
      name: 'Cottage cheese 5%',
      usualG: 250,
      per100g: { kcal: 100, proteinG: 11, carbsG: 3.2, fatG: 5 },
      timesLogged: 3,
    })
    expect(foods.find((f) => f.name === 'Tuna in water')?.per100g.proteinG).toBe(23.2)
  })

  it('names what was eaten today, so it is not offered again', () => {
    expect(buildSuggestionRequest(input()).eatenToday).toEqual(['Eggs'])
  })

  it('keeps within its limits', () => {
    const many = Array.from({ length: 40 }, (_, i) => meal('2026-11-25', 'LUNCH', [food(`Food ${i}`, 100, 100, 5)]))
    expect(buildSuggestionRequest(input({ history: many })).usualFoods).toHaveLength(MAX_USUAL_FOODS)
    expect(buildSuggestionRequest(input({ note: 'x'.repeat(500) })).note).toHaveLength(MAX_NOTE_CHARS)
  })

  it('carries a note and what to avoid only when there are some', () => {
    expect(buildSuggestionRequest(input())).not.toHaveProperty('note')
    expect(buildSuggestionRequest(input())).not.toHaveProperty('avoid')
    const asked = buildSuggestionRequest(input({ note: '  no cooking ', avoid: ['Cottage and cucumber'] }))
    expect(asked.note).toBe('no cooking')
    expect(asked.avoid).toEqual(['Cottage and cucumber'])
  })

  it('says nothing about who the person is', () => {
    const sent = JSON.stringify(buildSuggestionRequest(input({ note: 'quick' })))
    expect(sent).not.toContain(USER)
    expect(sent).not.toMatch(/"id"|recordId|provenance|userId|@/)
    // No dates either: the time of day is all the model needs.
    expect(sent).not.toMatch(/2026-/)
  })
})

describe('how a suggestion fits the day', () => {
  const progress = dayProgress(targets, { energyKcal: 1850, proteinG: 102, carbsG: 190, fatG: 63 })

  it('adds up its foods', () => {
    expect(
      totalsOf([
        { energyKcal: 116, proteinG: 26, carbsG: 0, fatG: 1 },
        { energyKcal: 100, proteinG: 11, carbsG: 3.2, fatG: 5 },
        { energyKcal: 70, proteinG: 1.5, carbsG: 14.5, fatG: 0.5 },
      ]),
    ).toEqual({ energyKcal: 286, proteinG: 38.5, carbsG: 17.7, fatG: 6.5 })
  })

  it('leaves calories to spare and reaches the protein', () => {
    expect(fitOf({ totals: { energyKcal: 286, proteinG: 38.5, carbsG: 17.7, fatG: 6.5 } }, progress)).toEqual({
      spareKcal: 14,
      proteinAfter: 141,
      proteinTarget: 140,
      proteinReached: true,
    })
  })

  it('says when it goes over, and when protein stays short', () => {
    const fit = fitOf({ totals: { energyKcal: 360, proteinG: 20, carbsG: 30, fatG: 15 } }, progress)
    expect(fit.spareKcal).toBe(-60)
    expect(fit.proteinReached).toBe(false)
  })
})
