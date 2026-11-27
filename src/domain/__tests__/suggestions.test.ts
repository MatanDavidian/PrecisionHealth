import { describe, expect, it } from 'vitest'
import {
  buildSuggestionRequest,
  fitOf,
  leftOf,
  mealsToCome,
  missingMeals,
  planRange,
  suggestPlan,
  todayQuestion,
  weekSoFar,
  type PastMeal,
  type WeekSoFar,
  MAX_NOTE_CHARS,
  MAX_USUAL_FOODS,
  totalsOf,
  type SuggestionInput,
} from '../suggestions'
import { dayProgress, type DailyTargets } from '../targets'
import { dayAnswers, type DayCheck } from '../dayChecks'
import { isEstimatedPortion } from '../corrections'
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
  /** A period of five counted days: its balance, its budget and its protein. */
  const week = (balanceKcal: number, proteinG = -40, budgetKcal = 10_830): WeekSoFar => ({
    from: '2026-11-22',
    to: '2026-11-26',
    periodDays: 5,
    days: 5,
    balanceKcal,
    budgetKcal,
    proteinG,
    fatG: 0,
    carbsG: 0,
    measuredDays: 4,
    excluded: [],
    sparse: false,
    today: { day: '2026-11-26', eatenKcal: 2476, targetKcal: 2150 },
  })
  const dinner = { slot: 'DINNER' as const, usualKcal: 650, usualTime: '20:00' }

  it('fills the day while it has 100 kcal left, up to what is left plus 10%', () => {
    expect(suggestPlan(progress(1850, 140))).toEqual({ kind: 'FILL', maxKcal: 330 })
  })

  it('keeps room for a usual meal still to come, or says to wait for it', () => {
    expect(suggestPlan(progress(1250, 93), week(0), [dinner])).toEqual({ kind: 'FILL', maxKcal: 275 })
    expect(suggestPlan(progress(1550, 93), week(0), [dinner])).toEqual({ kind: 'WAIT', meals: ['DINNER'], kcal: 650 })
  })

  it('offers nothing when the day is used and the protein reached', () => {
    expect(suggestPlan(progress(2130, 140), week(-500))).toBeUndefined()
    expect(suggestPlan(progress(2476, 140), week(-500))).toBeUndefined()
  })

  it('the owner’s Thursday: +89 of a 10,830 budget is within plan range, so the light snack, optional', () => {
    expect(suggestPlan(progress(2476, 129), week(89))).toMatchObject({
      kind: 'USED',
      status: 'WITHIN',
      scope: 'WEEK',
      balanceKcal: 89,
      rangeKcal: 325,
      maxKcal: 120,
      primary: false,
    })
  })

  it('below plan range: a protein snack as the main action, up to the room below plan and at most 250', () => {
    expect(suggestPlan(progress(2476, 129), week(-450))).toMatchObject({ status: 'BELOW', maxKcal: 250, primary: true })
    expect(suggestPlan(progress(2476, 129), week(-340))).toMatchObject({ status: 'BELOW', maxKcal: 250, primary: true })
    // With a smaller budget, -200 is below its ±150 range: up to 200.
    expect(suggestPlan(progress(2476, 129), week(-200, -40, 4000))).toMatchObject({ status: 'BELOW', maxKcal: 200 })
  })

  it('above plan range: better to stop, and still the optional light snack', () => {
    expect(suggestPlan(progress(2476, 129), week(400))).toMatchObject({ status: 'ABOVE', maxKcal: 120, primary: false })
  })

  it('the week’s protein ahead is said, and hides nothing', () => {
    expect(suggestPlan(progress(2476, 129), week(89, 64))).toMatchObject({ status: 'WITHIN', proteinAhead: true, maxKcal: 120 })
    expect(suggestPlan(progress(2476, 129), week(-450, 64))).toMatchObject({ status: 'BELOW', proteinAhead: true, primary: true })
  })

  it('with too few counted days, today alone decides', () => {
    const sparse = { ...week(-2000), sparse: true }
    // Today 326 over its 2,150 target, against ±150: above.
    expect(suggestPlan(progress(2476, 129), sparse)).toMatchObject({ scope: 'TODAY', status: 'ABOVE', balanceKcal: 326 })
    // Without the period at all, the same.
    expect(suggestPlan(progress(2476, 129))).toMatchObject({ scope: 'TODAY', status: 'ABOVE' })
    // 60 over today is within today's ±150.
    expect(suggestPlan(progress(2210, 129))).toMatchObject({ scope: 'TODAY', status: 'WITHIN', maxKcal: 120 })
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

describe('the plan range', () => {
  it('is ± the larger of 150 kcal and 3% of the budget', () => {
    expect(planRange(89, 10_830)).toEqual({ rangeKcal: 325, status: 'WITHIN' })
    expect(planRange(209, 10_830)).toEqual({ rangeKcal: 325, status: 'WITHIN' })
    expect(planRange(89, 10_000)).toEqual({ rangeKcal: 300, status: 'WITHIN' })
    expect(planRange(326, 2_060)).toEqual({ rangeKcal: 150, status: 'ABOVE' })
    expect(planRange(-180, 4_120)).toEqual({ rangeKcal: 150, status: 'BELOW' })
    // The edges are within.
    expect(planRange(325, 10_830).status).toBe('WITHIN')
    expect(planRange(-325, 10_830).status).toBe('WITHIN')
    expect(planRange(326, 10_830).status).toBe('ABOVE')
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
        week: {
          from: '2026-11-22',
          to: '2026-11-25',
          periodDays: 4,
          days: 4,
          balanceKcal: -450,
          budgetKcal: 8600,
          proteinG: -62,
          fatG: 40,
          carbsG: 0,
          measuredDays: 2,
          excluded: [],
          sparse: false,
          today: { day: '2026-11-25', eatenKcal: 2000, targetKcal: 2150 },
        },
        toCome: [{ slot: 'DINNER', usualKcal: 650, usualTime: '20:00' }],
        training: { workouts: [{ kind: 'STRENGTH', minutes: 62 }], activeKcal: 640 },
        preferences: { diets: ['NO_MEAT_WITH_DAIRY'], avoid: 'peanuts' },
      }),
    )
    expect(request).toMatchObject({
      mode: 'PROTEIN',
      maxKcal: 250,
      // The period as the model needs it: no dates, and where it stands against plan.
      week: { days: 4, balanceKcal: -450, proteinG: -62, fatG: 40, carbsG: 0, measuredDays: 2, rangeKcal: 258, status: 'BELOW' },
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
  const on = (day: number) => `2026-11-${String(day).padStart(2, '0')}`

  it('the owner’s Thursday, exactly: +89 against a 10,830 budget', () => {
    // Sunday to Wednesday: 8,533 eaten, 10,170 burned; the plan cuts 350 a day.
    const burned = [2500, 2550, 2560, 2560]
    const eaten = [2100, 2150, 2140, 2143]
    const week = weekSoFar(
      burned.map((burn, i) => ({ day: on(22 + i), eaten: ate(eaten[i]), targets: { ...rule, energyKcal: 2060 }, burnedKcal: burn })),
      { day: on(26), eaten: ate(2386), targets: { ...rule, energyKcal: 2060 } },
    )
    expect(week).toMatchObject({ from: on(22), to: on(26), periodDays: 5, days: 5, balanceKcal: 89, budgetKcal: 10_830 })
    expect(week.before).toEqual({
      from: on(22),
      to: on(25),
      days: 4,
      eatenKcal: 8533,
      expenditureKcal: 10_170,
      plannedKcal: 1400,
      budgetKcal: 8770,
    })
    expect(week.today).toEqual({ day: on(26), eatenKcal: 2386, targetKcal: 2060 })
    expect(week.sparse).toBe(false)
  })

  it('weighs each day before today against what it really burned, and today against its target', () => {
    const week = weekSoFar(
      [
        // Burned 2,900 on a long run: a budget of 2,550, eaten 2,300, 250 under.
        { day: on(23), eaten: ate(2300), targets: rule, burnedKcal: 2900 },
        // No burn recorded: against the target, 2,150; eaten 2,000, 150 under.
        { day: on(24), eaten: ate(2000), targets: rule },
      ],
      // Today: 2,476 against 2,150, 326 over.
      { day: on(25), eaten: ate(2476), targets: rule },
    )
    expect(week).toMatchObject({ days: 3, balanceKcal: -74, measuredDays: 1 })
  })

  it('adds up protein, fat and carbs against each day’s own targets', () => {
    const week = weekSoFar(
      [
        { day: on(23), eaten: ate(2150, 110, 90, 215), targets: rule },
        { day: on(24), eaten: ate(2150, 120, 85, 190), targets: rule },
      ],
      { day: on(25), eaten: ate(2150, 129, 78, 215), targets: rule },
    )
    expect(week).toMatchObject({ proteinG: -61, fatG: 37, carbsG: -25 })
  })

  it('leaves out an empty day and a day without targets, and says so', () => {
    const week = weekSoFar(
      [
        { day: on(23), eaten: ate(0), targets: rule },
        { day: on(24), eaten: ate(1800) },
      ],
      { day: on(25), eaten: ate(2000), targets: rule },
    )
    expect(week).toMatchObject({ periodDays: 3, days: 1, balanceKcal: -150, sparse: true })
    expect(week.excluded.map((d) => [d.day, d.reason])).toEqual([
      [on(23), 'EMPTY'],
      [on(24), 'NO_TARGETS'],
    ])
  })

  it('a day under half its target is out until answered; answered complete it counts, incomplete it stays out', () => {
    const tuesday = { day: on(24), eaten: ate(900), targets: rule }
    const others = [{ day: on(22), eaten: ate(2150), targets: rule }, { day: on(23), eaten: ate(2150), targets: rule }]
    const today = { day: on(25), eaten: ate(2150), targets: rule }

    const unanswered = weekSoFar([...others, tuesday], today)
    expect(unanswered.days).toBe(3)
    expect(unanswered.excluded).toEqual([{ day: on(24), reason: 'UNANSWERED', eatenKcal: 900, targetKcal: 2150 }])

    const complete = weekSoFar([...others, { ...tuesday, completeness: 'COMPLETE' }], today)
    expect(complete).toMatchObject({ days: 4, balanceKcal: 900 - 2150, excluded: [] })

    const incomplete = weekSoFar([...others, { ...tuesday, completeness: 'INCOMPLETE' }], today)
    expect(incomplete.days).toBe(3)
    expect(incomplete.excluded[0].reason).toBe('INCOMPLETE')
    // Out of both intake and budget: the balance is the other days' alone.
    expect(incomplete.balanceKcal).toBe(0)
    expect(incomplete.budgetKcal).toBe(3 * 2150)
  })

  it('a day set in one tap is an estimate by design, never "possibly incomplete"', () => {
    const week = weekSoFar([{ day: on(24), eaten: ate(900), targets: rule, setInOneTap: true }], { day: on(25), eaten: ate(2150), targets: rule })
    expect(week.excluded).toEqual([])
    expect(week.days).toBe(2)
  })

  it('a day the person said is incomplete stays out, however much is on it', () => {
    const week = weekSoFar(
      [{ day: on(24), eaten: ate(2000), targets: rule, completeness: 'INCOMPLETE' }],
      { day: on(25), eaten: ate(2150), targets: rule },
    )
    expect(week.excluded.map((d) => d.reason)).toEqual(['INCOMPLETE'])
  })

  it('does not believe a burn far below the usual: a watch that stopped counting', () => {
    // The usual burn is 2,500; 1,200 is a flat battery, not a day in bed.
    const week = weekSoFar([{ day: on(24), eaten: ate(2150), targets: rule, burnedKcal: 1200 }], { day: on(25), eaten: ate(0), targets: rule })
    expect(week.measuredDays).toBe(0)
    expect(week.balanceKcal).toBe(0 - 2150)
  })

  it('keeps a target the person typed in as theirs, whatever was burned', () => {
    const own = { ...rule, energy: { from: 'GOAL' as const } }
    const week = weekSoFar([{ day: on(24), eaten: ate(2150), targets: own, burnedKcal: 3000 }], { day: on(25), eaten: ate(2150), targets: own })
    expect(week).toMatchObject({ days: 2, balanceKcal: 0, measuredDays: 0 })
  })

  it('is sparse with fewer than three counted days', () => {
    expect(weekSoFar([], { day: on(22), eaten: ate(2000), targets: rule }).sparse).toBe(true)
    expect(
      weekSoFar(
        [
          { day: on(22), eaten: ate(2000), targets: rule },
          { day: on(23), eaten: ate(2000), targets: rule },
        ],
        { day: on(24), eaten: ate(2000), targets: rule },
      ).sparse,
    ).toBe(false)
  })
})

describe('asking about today first', () => {
  /** Ten days of lunch at 13:00 and dinner at 20:00. */
  const history: PastMeal[] = Array.from({ length: 10 }, (_, i) => {
    const day = `2026-11-${String(10 + i).padStart(2, '0')}`
    return [
      { day, slot: 'LUNCH' as const, time: '13:00', kcal: 690 },
      { day, slot: 'DINNER' as const, time: '20:00', kcal: 650 },
    ]
  }).flat()

  it('a usual lunch not logged by 14:30 looks missing; not before, and not once skipped', () => {
    expect(missingMeals(history, [], '20:40').map((m) => m.slot)).toEqual(['LUNCH'])
    expect(missingMeals(history, [], '14:20')).toEqual([])
    expect(missingMeals(history, ['LUNCH'], '20:40')).toEqual([])
    expect(missingMeals(history, [], '20:40', ['LUNCH'])).toEqual([])
    expect(missingMeals(history, [], '22:00').map((m) => m.slot)).toEqual(['LUNCH', 'DINNER'])
  })

  it('asks about a missing meal first; about a low day from 18:00; and nothing once today is answered complete', () => {
    const lunch = { slot: 'LUNCH' as const, usualKcal: 690, usualTime: '13:00' }
    expect(todayQuestion({ missing: [lunch], eatenKcal: 1500, targetKcal: 2150, nowTime: '20:40' })).toEqual({
      kind: 'MISSING',
      meals: [lunch],
    })
    expect(todayQuestion({ missing: [], eatenKcal: 900, targetKcal: 2150, nowTime: '20:40' })).toEqual({ kind: 'LOW' })
    expect(todayQuestion({ missing: [], eatenKcal: 900, targetKcal: 2150, nowTime: '12:00' })).toBeUndefined()
    expect(todayQuestion({ missing: [], eatenKcal: 1500, targetKcal: 2150, nowTime: '20:40' })).toBeUndefined()
    expect(
      todayQuestion({ missing: [lunch], eatenKcal: 900, targetKcal: 2150, nowTime: '20:40', completeness: 'COMPLETE' }),
    ).toBeUndefined()
    // A usual meal said to be skipped explains a low day: one question is enough.
    expect(todayQuestion({ missing: [], eatenKcal: 900, targetKcal: 2150, nowTime: '20:40', skipped: ['LUNCH'] })).toBeUndefined()
    // Said "not everything": not asked again.
    expect(todayQuestion({ missing: [], eatenKcal: 900, targetKcal: 2150, nowTime: '20:40', completeness: 'INCOMPLETE' })).toBeUndefined()
  })
})

describe('what the person said about a day', () => {
  const check = (day: string, at: string, answer: Partial<DayCheck>): DayCheck => ({
    id: `${day}-${at}`,
    userId: USER,
    day,
    recordedAt: `${day}T${at}:00.000Z`,
    ...answer,
  })

  it('the latest completeness wins, UNSET takes it back, and skipped meals add up', () => {
    const answers = dayAnswers([
      check('2026-11-24', '20:00', { completeness: 'INCOMPLETE' }),
      check('2026-11-24', '21:00', { completeness: 'COMPLETE' }),
      check('2026-11-25', '19:00', { completeness: 'COMPLETE' }),
      check('2026-11-25', '19:30', { completeness: 'UNSET' }),
      check('2026-11-26', '20:40', { skipped: 'LUNCH' }),
      check('2026-11-26', '20:41', { skipped: 'LUNCH' }),
      check('2026-11-26', '20:42', { skipped: 'BREAKFAST' }),
    ])
    expect(answers.get('2026-11-24')).toEqual({ completeness: 'COMPLETE', skipped: [] })
    expect(answers.get('2026-11-25')).toEqual({ completeness: undefined, skipped: [] })
    expect(answers.get('2026-11-26')).toEqual({ completeness: undefined, skipped: ['LUNCH', 'BREAKFAST'] })
  })

  it('an estimated portion stays one after confirming; typed numbers are not one', () => {
    expect(isEstimatedPortion({ source: 'AI_ESTIMATE', kind: 'DERIVED', recordedAt: 'x' })).toBe(true)
    expect(isEstimatedPortion({ source: 'USER', kind: 'USER_CONFIRMED', recordedAt: 'x', supersedes: ['a'] })).toBe(true)
    expect(isEstimatedPortion({ source: 'USER', kind: 'RAW', recordedAt: 'x' })).toBe(false)
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

  it('on a full day, says what it adds today and where the period lands against its plan', () => {
    const full = dayProgress(targets, { energyKcal: 2476, proteinG: 134, carbsG: 241, fatG: 78 })
    const fit = fitOf({ totals: { energyKcal: 120, proteinG: 17, carbsG: 5, fatG: 1.5 } }, full, {
      balanceKcal: 89,
      budgetKcal: 10_830,
    })
    expect(fit).toMatchObject({ todayFull: true, proteinAfter: 151, proteinReached: true, balanceAfter: 209, statusAfter: 'WITHIN' })
  })
})
