import { describe, expect, it } from 'vitest'
import {
  canonical,
  findGaps,
  isPatternFilled,
  MIN_DAYS_FOR_FILL,
  typicalDay,
  userEntered,
  type CalendarDate,
  type Meal,
  type MealId,
  type MealSlot,
  type UserId,
} from '..'
import type { Provenance } from '../provenance'

const USER = 'user-fill' as UserId
const ZONE = 'Asia/Jerusalem'

const meal = (
  day: string,
  slot: MealSlot,
  name: string,
  provenance: Provenance = userEntered(`${day}T09:00:00.000Z`),
): Meal => ({
  id: `${day}-${slot}-${name}` as MealId,
  recordId: `${day}-${slot}-${name}-v1`,
  version: 1,
  userId: USER,
  slot,
  time: { kind: 'instant', at: `${day}T09:00:00.000Z`, zone: ZONE },
  items: [
    {
      id: `${day}-${slot}-item` as Meal['items'][number]['id'],
      mealId: `${day}-${slot}-${name}` as MealId,
      name,
      amount: canonical(200, 'g'),
      nutrients: {
        energy: canonical(400, 'kcal'),
        protein: canonical(30, 'g'),
        carbs: canonical(40, 'g'),
        fat: canonical(12, 'g'),
      },
      provenance: userEntered(`${day}T09:00:00.000Z`),
    },
  ],
  provenance,
})

const filled = (day: string, slot: MealSlot, name: string) =>
  meal(day, slot, name, {
    source: 'PATTERN_FILL',
    kind: 'DERIVED',
    recordedAt: `${day}T09:00:00.000Z`,
  })

/** A fortnight of the same breakfast and lunch, ending before the gap. */
const history = (days: string[]) =>
  days.flatMap((d) => [meal(d, 'BREAKFAST', 'Eggs and oats'), meal(d, 'LUNCH', 'Chicken and rice')])

describe('the rule that keeps this honest', () => {
  it('never lets a filled day feed the average it came from', () => {
    /*
      The failure this prevents: skip a week, fill each day from the last, and
      the baseline is eventually made of guesses about guesses. So a filled day
      is not evidence, and the count of days drawn from proves it.
    */
    const real = history(['2026-09-01', '2026-09-02', '2026-09-03'])
    const invented = [
      filled('2026-09-04', 'BREAKFAST', 'Eggs and oats'),
      filled('2026-09-05', 'BREAKFAST', 'Eggs and oats'),
    ]

    const withInvented = typicalDay([...real, ...invented], {
      source: 'RECENT',
      forDay: '2026-09-06' as CalendarDate,
      today: '2026-09-06' as CalendarDate,
    })
    const realOnly = typicalDay(real, {
      source: 'RECENT',
      forDay: '2026-09-06' as CalendarDate,
      today: '2026-09-06' as CalendarDate,
    })

    expect(withInvented?.drawnFrom).toBe(3)
    expect(withInvented?.drawnFrom).toBe(realOnly?.drawnFrom)
  })

  it('marks a filled meal in the record, not on a screen', () => {
    // The tag has to survive every reader that never heard of this feature.
    expect(isPatternFilled(filled('2026-09-04', 'LUNCH', 'Chicken and rice'))).toBe(true)
    expect(isPatternFilled(meal('2026-09-04', 'LUNCH', 'Chicken and rice'))).toBe(false)
  })
})

describe('what a typical day is drawn from', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']

  it('offers the meals actually eaten, not an average of them', () => {
    // Averaging two breakfasts gives 1.5 eggs and a meal nobody ate. This
    // copies a real one, which is also what makes "correct it" a small edit.
    const typical = typicalDay(history(days), {
      source: 'RECENT',
      forDay: '2026-09-05' as CalendarDate,
      today: '2026-09-05' as CalendarDate,
    })
    expect(typical?.meals.map((m) => m.slot).sort()).toEqual(['BREAKFAST', 'LUNCH'])
    expect(typical?.meals[0].template.items[0].name).toBe('Eggs and oats')
  })

  it('refuses when there is not enough history to call anything typical', () => {
    // Two days wearing a statistical hat is not a habit, and the offer should
    // not appear at all rather than appear and produce something silly.
    const thin = history(days.slice(0, MIN_DAYS_FOR_FILL - 1))
    expect(
      typicalDay(thin, {
        source: 'RECENT',
        forDay: '2026-09-05' as CalendarDate,
        today: '2026-09-05' as CalendarDate,
      }),
    ).toBeUndefined()
  })

  it('leaves out a slot that is occasional rather than usual', () => {
    // One late snack in a fortnight is not a typical snack, and inventing one
    // on every filled day would inflate them above what the person eats.
    const withOneSnack = [...history(days), meal('2026-09-02', 'SNACK', 'Crisps')]
    const typical = typicalDay(withOneSnack, {
      source: 'RECENT',
      forDay: '2026-09-05' as CalendarDate,
      today: '2026-09-05' as CalendarDate,
    })
    expect(typical?.meals.map((m) => m.slot)).not.toContain('SNACK')
  })

  it('can draw from the same weekday instead, when the week has a shape', () => {
    // Four Tuesdays. A Sunday long-run diet should not colour a Tuesday.
    const tuesdays = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']
    const typical = typicalDay(history(tuesdays), {
      source: 'SAME_WEEKDAY',
      forDay: '2026-09-29' as CalendarDate,
      today: '2026-09-29' as CalendarDate,
    })
    expect(typical?.drawnFrom).toBe(4)
    expect(typical?.source).toBe('SAME_WEEKDAY')
  })

  it('never draws on the day it is filling, or after it', () => {
    const withLater = [...history(days), ...history(['2026-09-05', '2026-09-06'])]
    const typical = typicalDay(withLater, {
      source: 'RECENT',
      forDay: '2026-09-05' as CalendarDate,
      today: '2026-09-06' as CalendarDate,
    })
    expect(typical?.drawnFrom).toBe(4)
  })
})

describe('which days are gaps', () => {
  const week = [
    '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05',
  ] as CalendarDate[]

  it('finds the days with nothing on them', () => {
    const logged = history(['2026-09-01', '2026-09-03'])
    const gaps = findGaps(week, logged, '2026-09-05' as CalendarDate)
    expect(gaps.map((g) => g.day)).toEqual(['2026-09-02', '2026-09-04'])
  })

  it('never offers to fill today, which is still happening', () => {
    // Filling today would invent a dinner nobody has eaten yet.
    const gaps = findGaps(week, [], '2026-09-03' as CalendarDate)
    expect(gaps.map((g) => g.day)).toEqual(['2026-09-01', '2026-09-02'])
  })

  it('still reports a filled day as a gap, but one already answered', () => {
    // It has no real meals, so it is not evidence — but the offer must not be
    // made twice, and the UI needs to know which it is.
    const gaps = findGaps(week, [filled('2026-09-02', 'BREAKFAST', 'Eggs and oats')],
      '2026-09-05' as CalendarDate)
    expect(gaps.find((g) => g.day === '2026-09-02')?.filled).toBe(true)
    expect(gaps.find((g) => g.day === '2026-09-01')?.filled).toBe(false)
  })
})
