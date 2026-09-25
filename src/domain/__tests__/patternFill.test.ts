import { describe, expect, it } from 'vitest'
import {
  canonical,
  countedMeals,
  findGaps,
  findUsualFoods,
  findUsualMeals,
  isPatternFilled,
  MIN_DAYS_FOR_FILL,
  repeatDay,
  typicalIntake,
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
  kcal = 400,
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
        energy: canonical(kcal, 'kcal'),
        protein: canonical(30, 'g'),
        carbs: canonical(40, 'g'),
        fat: canonical(12, 'g'),
      },
      provenance: userEntered(`${day}T09:00:00.000Z`),
    },
  ],
  provenance,
})

const filled = (day: string, slot: MealSlot, name: string, kcal = 400) =>
  meal(day, slot, name, {
    source: 'PATTERN_FILL',
    kind: 'DERIVED',
    recordedAt: `${day}T09:00:00.000Z`,
  }, kcal)

const real = (day: string, slot: MealSlot, name: string, kcal: number) =>
  meal(day, slot, name, undefined, kcal)

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
    const logged = history(['2026-09-01', '2026-09-02', '2026-09-03'])
    const invented = [
      filled('2026-09-04', 'BREAKFAST', 'Eggs and oats'),
      filled('2026-09-05', 'BREAKFAST', 'Eggs and oats'),
    ]

    const withInvented = typicalIntake([...logged, ...invented], {
      source: 'RECENT',
      forDay: '2026-09-06' as CalendarDate,
    })
    const realOnly = typicalIntake(logged, {
      source: 'RECENT',
      forDay: '2026-09-06' as CalendarDate,
    })

    expect(withInvented?.drawnFrom).toBe(3)
    expect(withInvented).toEqual(realOnly)
  })

  it('marks a filled meal in the record, not on a screen', () => {
    // The tag has to survive every reader that never heard of this feature.
    expect(isPatternFilled(filled('2026-09-04', 'LUNCH', 'Chicken and rice'))).toBe(true)
    expect(isPatternFilled(meal('2026-09-04', 'LUNCH', 'Chicken and rice'))).toBe(false)
  })
})

describe('what a typical day is drawn from', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
  const opts = (forDay: string) => ({
    source: 'RECENT' as const,
    forDay: forDay as CalendarDate,
  })

  it('is the mean of each logged day\'s total', () => {
    const typical = typicalIntake(history(days), opts('2026-09-05'))
    // Two 400 kcal meals a day, every day.
    expect(typical?.energyKcal).toBe(800)
    expect(typical?.proteinG).toBe(60)
    expect(typical?.carbsG).toBe(80)
    expect(typical?.fatG).toBe(24)
  })

  it('is the true average on a varied fortnight — where the old picker filled 1,200 of 1,920', () => {
    /*
      The case that retired the earlier method. It chose the most frequent
      meal per slot, and the meals that repeat are the plain ones: yogurt,
      salad, soup won every slot, the shawarma and the pizza never did, and
      a snack on four days of ten was dropped as "occasional". The result
      was consistently low under a button that said "average".
    */
    const lunches = [450, 450, 950, 800, 900, 1100, 450, 850, 1000, 900]
    const dinners = [400, 900, 400, 850, 800, 400, 750, 700, 1000, 650]
    const tenDays = lunches.map((_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
    const varied = tenDays.flatMap((d, i) => [
      real(d, 'BREAKFAST', 'Yogurt', 350),
      real(d, 'LUNCH', `Lunch ${i}`, lunches[i]),
      real(d, 'DINNER', `Dinner ${i}`, dinners[i]),
      ...(i % 3 === 0 ? [real(d, 'SNACK', 'Chocolate', 250)] : []),
    ])
    const typical = typicalIntake(varied, opts('2026-09-11'))
    expect(typical?.drawnFrom).toBe(10)
    expect(typical?.energyKcal).toBe(1920)
  })

  it('averages over days, not meals — a day with a snack is a bigger day', () => {
    const typical = typicalIntake(
      [
        real('2026-09-01', 'LUNCH', 'A', 1000),
        real('2026-09-02', 'LUNCH', 'A', 1000),
        real('2026-09-03', 'LUNCH', 'A', 1000),
        real('2026-09-03', 'SNACK', 'B', 300),
      ],
      opts('2026-09-04'),
    )
    // Per meal would say 825. The person ate 1,000, 1,000 and 1,300.
    expect(typical?.energyKcal).toBe(1100)
  })

  it('ignores a retracted meal', () => {
    const deleted = { ...real('2026-09-02', 'SNACK', 'Cake', 900), retracted: true }
    const typical = typicalIntake([...history(days), deleted], opts('2026-09-05'))
    expect(typical?.energyKcal).toBe(800)
  })

  it('refuses when there is not enough history to call anything typical', () => {
    // Two days wearing a statistical hat is not a habit, and the offer should
    // not appear at all rather than appear and produce something silly.
    const thin = history(days.slice(0, MIN_DAYS_FOR_FILL - 1))
    expect(typicalIntake(thin, opts('2026-09-05'))).toBeUndefined()
  })

  it('can draw from the same weekday instead, when the week has a shape', () => {
    // Four Tuesdays. A Sunday long-run diet should not colour a Tuesday.
    const tuesdays = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']
    const sunday = real('2026-09-20', 'DINNER', 'Feast', 3000)
    const typical = typicalIntake([...history(tuesdays), sunday], {
      source: 'SAME_WEEKDAY',
      forDay: '2026-09-29' as CalendarDate,
    })
    expect(typical?.drawnFrom).toBe(4)
    expect(typical?.source).toBe('SAME_WEEKDAY')
    expect(typical?.energyKcal).toBe(800)
  })

  it('never draws on the day it is filling, or after it', () => {
    const withLater = [...history(days), ...history(['2026-09-05', '2026-09-06'])]
    expect(typicalIntake(withLater, opts('2026-09-05'))?.drawnFrom).toBe(4)
  })
})

describe('when the recent days were filled rather than logged', () => {
  const back = (n: number) => {
    const d = new Date('2026-09-25T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  const forToday = { source: 'RECENT' as const, forDay: '2026-09-25' as CalendarDate }

  it('reaches back past a fortnight of estimates to the last days that were logged', () => {
    /*
      From real use: two weeks filled, a full history before them, and the
      offer said "not enough history". The window was 14 calendar days, and
      filled days are not evidence — so filling emptied its own window.
    */
    const estimates = Array.from({ length: 14 }, (_, i) => filled(back(i + 1), 'LUNCH', 'Estimated day', 2000))
    const logged = [20, 21, 22, 23, 24].map((n) => real(back(n), 'LUNCH', 'Pasta', 1800))
    const typical = typicalIntake([...estimates, ...logged], forToday)
    expect(typical?.drawnFrom).toBe(5)
    expect(typical?.energyKcal).toBe(1800)
    expect(typical?.from).toBe(back(24))
    expect(typical?.to).toBe(back(20))
  })

  it('takes the most recent fourteen logged days, and no more', () => {
    const recent = Array.from({ length: 14 }, (_, i) => real(back(i + 30), 'LUNCH', 'Recent', 2000))
    const older = Array.from({ length: 10 }, (_, i) => real(back(i + 50), 'LUNCH', 'Older', 1000))
    const typical = typicalIntake([...recent, ...older], forToday)
    expect(typical?.drawnFrom).toBe(14)
    expect(typical?.energyKcal).toBe(2000)
  })

  it('stops at a season: a logged week from long ago is not how someone eats now', () => {
    const longAgo = [95, 96, 97, 98].map((n) => real(back(n), 'LUNCH', 'Old', 2500))
    expect(typicalIntake(longAgo, forToday)).toBeUndefined()
  })

  it('counts the season back from the day being filled, not from today', () => {
    // Filling a day in June draws on May, even though May is long past now.
    const may = ['2026-05-10', '2026-05-11', '2026-05-12'].map((d) => real(d, 'LUNCH', 'May', 1700))
    const typical = typicalIntake(may, { source: 'RECENT', forDay: '2026-06-15' as CalendarDate })
    expect(typical?.energyKcal).toBe(1700)
  })
})

describe('a real meal on a filled day', () => {
  it('replaces the estimate instead of adding to it', () => {
    /*
      Fill Tuesday with an average 2,000 kcal day, then log Tuesday's dinner.
      Summing both would say 2,700 — a whole estimated day on top of the
      dinner it was standing in for.
    */
    const estimate = filled('2026-09-02', 'LUNCH', 'Estimated day', 2000)
    const dinner = real('2026-09-02', 'DINNER', 'Pasta', 700)
    expect(countedMeals([estimate, dinner])).toEqual([dinner])
  })

  it('keeps the estimate where nothing real was logged', () => {
    const estimate = filled('2026-09-02', 'LUNCH', 'Estimated day', 2000)
    const elsewhere = real('2026-09-03', 'DINNER', 'Pasta', 700)
    expect(countedMeals([estimate, elsewhere])).toEqual([estimate, elsewhere])
  })

  it('falls back to the estimate if the real meal is deleted again', () => {
    const estimate = filled('2026-09-02', 'LUNCH', 'Estimated day', 2000)
    const deleted = { ...real('2026-09-02', 'DINNER', 'Pasta', 700), retracted: true }
    expect(countedMeals([estimate, deleted])).toContain(estimate)
  })
})

describe('an estimate is never mistaken for eating', () => {
  const estimate = filled('2026-09-02', 'LUNCH', 'Estimated day', 2000)

  it('is not a usual meal or a usual food, however many days were filled', () => {
    const many = ['2026-09-02', '2026-09-03', '2026-09-04'].map((d) =>
      filled(d, 'LUNCH', 'Estimated day', 2000),
    )
    expect(findUsualMeals(many)).toEqual([])
    expect(findUsualFoods(many)).toEqual([])
  })

  it('is never copied by repeating a day — a copy would look observed', () => {
    const result = repeatDay([estimate], USER, {
      onDate: '2026-09-10' as CalendarDate,
      zone: ZONE,
      now: new Date('2026-09-11T00:00:00Z'),
      newId: () => crypto.randomUUID(),
    })
    expect(result.meals).toEqual([])
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
