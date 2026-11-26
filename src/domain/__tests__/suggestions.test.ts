import { describe, expect, it } from 'vitest'
import {
  buildSuggestionRequest,
  fitOf,
  leftOf,
  mealsToCome,
  suggestPlan,
  weekSoFar,
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

describe('whether to offer suggestions, and what', () => {
  const progress = (energyKcal: number, proteinG: number) =>
    dayProgress(targets, { energyKcal, proteinG, carbsG: 100, fatG: 40 })
  /** A week: calories and protein as given, four days of it. */
  const week = (balanceKcal: number, proteinG = -40) => ({ days: 4, balanceKcal, proteinG, fatG: 0, carbsG: 0, measuredDays: 2 })
  const dinner = { slot: 'DINNER' as const, usualKcal: 650, usualTime: '20:00' }

  it('fills the day while it has 100 kcal left, up to what is left plus 10%', () => {
    expect(suggestPlan(progress(1850, 140))).toEqual({ kind: 'FILL', maxKcal: 330 })
  })

  it('keeps room for a usual meal still to come', () => {
    // 900 left at 16:30, dinner usually 650: 250 for now.
    expect(suggestPlan(progress(1250, 93), week(0), [dinner])).toEqual({ kind: 'FILL', maxKcal: 275 })
  })

  it('says to wait when the meal to come takes what is left', () => {
    expect(suggestPlan(progress(1550, 93), week(0), [dinner])).toEqual({ kind: 'WAIT', meals: ['DINNER'], kcal: 650 })
  })

  it('offers nothing when the day is used and the protein reached', () => {
    expect(suggestPlan(progress(2130, 140), week(-500))).toBeUndefined()
    expect(suggestPlan(progress(2476, 140), week(-500))).toBeUndefined()
  })

  it('over today but short of protein, with room in the week: a lean protein snack, at most 250 kcal', () => {
    // 326 over today, 11 g short (of 140); the week 450 under, today included, and behind on protein.
    expect(suggestPlan(progress(2476, 129), week(-450))).toEqual({ kind: 'PROTEIN', maxKcal: 250 })
    expect(suggestPlan(progress(2476, 129), week(-180))).toEqual({ kind: 'PROTEIN', maxKcal: 180 })
  })

  it('with no room in the week: better to stop', () => {
    expect(suggestPlan(progress(2476, 129), week(180))).toEqual({ kind: 'STOP', reason: 'WEEK_FULL' })
    expect(suggestPlan(progress(2476, 129), week(-60))).toEqual({ kind: 'STOP', reason: 'WEEK_FULL' })
    // And without the week, today alone, which is full.
    expect(suggestPlan(progress(2476, 129))).toEqual({ kind: 'STOP', reason: 'WEEK_FULL' })
  })

  it('with the week’s protein ahead, today’s gap can wait, even with room in the week', () => {
    expect(suggestPlan(progress(2476, 129), week(-450, 47))).toEqual({ kind: 'STOP', reason: 'PROTEIN_AHEAD' })
    // Only once there is a week to speak of: on its first day, today alone.
    expect(suggestPlan(progress(2476, 129), { ...week(-450, 47), days: 1 })).toEqual({ kind: 'PROTEIN', maxKcal: 250 })
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

describe('the usual meals still to come', () => {
  /** Ten days: lunch at about 13:00 (550 kcal), dinner at about 20:00 (650), breakfast on two days only. */
  const history = Array.from({ length: 10 }, (_, i) => {
    const day = `2026-11-${String(10 + i).padStart(2, '0')}`
    return [
      { day, slot: 'LUNCH' as const, time: '13:00', kcal: 550 },
      { day, slot: 'DINNER' as const, time: i % 2 ? '20:00' : '19:45', kcal: 650 },
      ...(i < 2 ? [{ day, slot: 'BREAKFAST' as const, time: '08:00', kcal: 400 }] : []),
    ]
  }).flat()

  it('at 16:30, dinner is still to come; lunch and breakfast are not', () => {
    expect(mealsToCome(history, ['LUNCH'], '16:30')).toEqual([{ slot: 'DINNER', usualKcal: 650, usualTime: '19:53' }])
  })

  it('at 10:00 with nothing logged, lunch and dinner are; breakfast is not usual', () => {
    expect(mealsToCome(history, [], '10:00').map((m) => m.slot)).toEqual(['LUNCH', 'DINNER'])
  })

  it('not once it is logged, nor within 45 minutes of its usual time', () => {
    expect(mealsToCome(history, ['DINNER'], '16:30')).toEqual([])
    expect(mealsToCome(history, [], '19:10')).toEqual([])
  })

  it('nothing from a history too short to call usual', () => {
    expect(mealsToCome(history.slice(0, 6), [], '10:00')).toEqual([])
  })
})

describe('the request', () => {
  it('carries what is left, the slot, the time and the goal', () => {
    const request = buildSuggestionRequest(input())
    expect(request.left).toEqual({ energyKcal: 300, proteinG: 38, carbsG: 25, fatG: 9 })
    expect(request.slot).toBe('DINNER')
    expect(request.localTime).toBe('20:40')
    expect(request.goal).toEqual({ aim: 'LOSE', focus: ['FAT'], objective: 'LOSE_FAT' })
    // Filling the day by default, up to what is left plus 10%.
    expect(request.mode).toBe('FILL')
    expect(request.maxKcal).toBe(330)
    expect(request).not.toHaveProperty('week')
  })

  it('carries the plan and the week when the card has them', () => {
    const request = buildSuggestionRequest(
      input({
        plan: { kind: 'PROTEIN', maxKcal: 250 },
        week: { days: 4, balanceKcal: -450, proteinG: -62, fatG: 40, carbsG: 0, measuredDays: 2 },
        toCome: [{ slot: 'DINNER', usualKcal: 650, usualTime: '20:00' }],
        training: { workouts: [{ kind: 'STRENGTH', minutes: 62 }], activeKcal: 640 },
        preferences: { diets: ['NO_MEAT_WITH_DAIRY'], avoid: 'peanuts' },
      }),
    )
    expect(request).toMatchObject({
      mode: 'PROTEIN',
      maxKcal: 250,
      week: { days: 4, balanceKcal: -450, proteinG: -62, fatG: 40, carbsG: 0, measuredDays: 2 },
      stillToCome: [{ slot: 'DINNER', usualKcal: 650, usualTime: '20:00' }],
      trainingToday: { workouts: [{ kind: 'STRENGTH', minutes: 62 }], activeKcal: 640 },
      preferences: { diets: ['NO_MEAT_WITH_DAIRY'], avoid: 'peanuts' },
    })
    // A rest day with nothing to say about training sends nothing about it.
    expect(buildSuggestionRequest(input({ training: { workouts: [] } }))).not.toHaveProperty('trainingToday')
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

describe('the week so far', () => {
  const rule = { energyKcal: 2150, proteinG: 140, carbsG: 215, fatG: 72, balanceKcal: -350, energy: { from: 'RULE' as const } }
  const ate = (energyKcal: number, proteinG = 140, fatG = 72, carbsG = 215) => ({ energyKcal, proteinG, fatG, carbsG })

  it('weighs each day before today against what it really burned, and today against its target', () => {
    const week = weekSoFar(
      [
        // Burned 2,900 on a long run: a budget of 2,550, eaten 2,300, 250 under.
        { eaten: ate(2300), targets: rule, burnedKcal: 2900 },
        // No burn recorded: against the target, 2,150; eaten 2,000, 150 under.
        { eaten: ate(2000), targets: rule },
      ],
      // Today: 2,476 against 2,150, 326 over.
      { eaten: ate(2476), targets: rule },
    )
    expect(week).toMatchObject({ days: 3, balanceKcal: -74, measuredDays: 1 })
  })

  it('adds up protein, fat and carbs against each day’s own targets', () => {
    const week = weekSoFar(
      [
        { eaten: ate(2150, 110, 90, 215), targets: rule },
        { eaten: ate(2150, 120, 85, 190), targets: rule },
      ],
      { eaten: ate(2150, 129, 78, 215), targets: rule },
    )
    expect(week).toMatchObject({ proteinG: -61, fatG: 37, carbsG: -25 })
  })

  it('leaves out a day with nothing on it, and a day without targets', () => {
    const week = weekSoFar([{ eaten: ate(0), targets: rule }, { eaten: ate(1800) }], { eaten: ate(2000), targets: rule })
    expect(week).toMatchObject({ days: 1, balanceKcal: -150, measuredDays: 0 })
  })

  it('does not believe a burn far below the usual: a watch that stopped counting', () => {
    // The usual burn is 2,500; 1,200 is a flat battery, not a day in bed.
    const week = weekSoFar([{ eaten: ate(2150), targets: rule, burnedKcal: 1200 }], { eaten: ate(0), targets: rule })
    expect(week.measuredDays).toBe(0)
    expect(week.balanceKcal).toBe(0 - 2150)
  })

  it('keeps a target the person typed in as theirs, whatever was burned', () => {
    const own = { ...rule, energy: { from: 'GOAL' as const } }
    const week = weekSoFar([{ eaten: ate(2150), targets: own, burnedKcal: 3000 }], { eaten: ate(2150), targets: own })
    expect(week).toMatchObject({ days: 2, balanceKcal: 0, measuredDays: 0 })
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
      todayFull: false,
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

  it('on a full day, says what it adds today and where the week lands', () => {
    const full = dayProgress(targets, { energyKcal: 2476, proteinG: 134, carbsG: 241, fatG: 78 })
    const fit = fitOf({ totals: { energyKcal: 105, proteinG: 17, carbsG: 5, fatG: 1.5 } }, full, {
      days: 4,
      balanceKcal: -450,
      proteinG: -40,
      fatG: 0,
      carbsG: 0,
      measuredDays: 2,
    })
    expect(fit).toMatchObject({ todayFull: true, proteinAfter: 151, proteinReached: true, weekAfter: -345 })
  })
})
