import { describe, expect, it } from 'vitest'
import {
  addWeeks,
  peakOf,
  summariseWeek,
  weekContaining,
  weekEndingOn,
  weekStartOf,
  type DayEnergy,
} from '../week'
import type { CalendarDate } from '../time'

const day = (d: string, eaten: number, burned?: number): DayEnergy => ({
  day: d,
  eatenKcal: eaten,
  burnedKcal: burned,
})

const fullWeek = [
  day('2026-08-22', 2040, 2380),
  day('2026-08-23', 2260, 2510),
  day('2026-08-24', 2680, 2440),
  day('2026-08-25', 2150, 2280),
  day('2026-08-26', 1890, 2300),
  day('2026-08-27', 2410, 2620),
  day('2026-08-28', 2330, 2450),
]

describe('the seven days', () => {
  it('ends on the day given and runs oldest first', () => {
    const days = weekEndingOn('2026-08-28')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-08-22')
    expect(days.at(-1)).toBe('2026-08-28')
  })

  it('crosses a month boundary without arithmetic of its own', () => {
    expect(weekEndingOn('2026-09-02')[0]).toBe('2026-08-27')
  })
})

describe('rolling a week up', () => {
  it('totals both series and nets them', () => {
    const week = summariseWeek(fullWeek)
    expect(week.balance.eatenKcal).toBe(15_760)
    expect(week.balance.burnedKcal).toBe(16_980)
    expect(week.balance.netKcal).toBe(-1220)
  })

  it('counts only the days that reported a burn', () => {
    // A day with no figure is a day we know nothing about — averaging it in
    // as zero would turn a missing measurement into a claim about the body.
    const partial = [day('2026-08-22', 2000, 2400), day('2026-08-23', 2000), day('2026-08-24', 2000)]
    const week = summariseWeek(partial)
    expect(week.daysWithBurn).toBe(1)
    expect(week.balance.burnedKcal).toBe(2400)
  })

  it('scales the target to the days that actually have data', () => {
    // Grading four days against a whole week's target would manufacture a
    // deficit out of nothing but absence.
    const threeDays = [
      day('2026-08-22', 2000, 2400),
      day('2026-08-23', 2000, 2400),
      day('2026-08-24', 2000, 2400),
    ]
    expect(summariseWeek(threeDays, 'LOSE_WEIGHT').aimKcal).toBe(-1500)
    expect(summariseWeek(fullWeek, 'LOSE_WEIGHT').aimKcal).toBe(-3500)
  })

  it('grades nothing when no burn was recorded at all', () => {
    const noBurn = fullWeek.map((d) => ({ ...d, burnedKcal: undefined }))
    const week = summariseWeek(noBurn, 'LOSE_WEIGHT')
    expect(week.aimKcal).toBeNull()
    expect(week.verdict).toBe('UNGRADED')
  })

  it('grades nothing without an objective, however complete the data', () => {
    expect(summariseWeek(fullWeek).verdict).toBe('UNGRADED')
  })

  it('passes a week that beat its deficit', () => {
    const week = summariseWeek(fullWeek, 'LOSE_WEIGHT')
    expect(week.aimKcal).toBe(-3500)
    expect(week.balance.netKcal).toBe(-1220)
    // −1220 is not as deep as −3500, so this one is off target.
    expect(week.verdict).toBe('OFF_TARGET')
    expect(week.gapKcal).toBe(2280)
  })

  it('reports the range it covered', () => {
    const week = summariseWeek(fullWeek)
    expect(week.from).toBe('2026-08-22')
    expect(week.to).toBe('2026-08-28')
  })

  it('survives an empty week rather than dividing by zero', () => {
    const week = summariseWeek([], 'LOSE_WEIGHT')
    expect(week.balance.netKcal).toBe(0)
    expect(week.daysWithBurn).toBe(0)
    expect(week.verdict).toBe('UNGRADED')
  })
})

describe('scaling the chart', () => {
  it('shares one scale across both series', () => {
    expect(peakOf(fullWeek)).toBe(2680)
  })

  it('never returns zero, so a blank week cannot divide by it', () => {
    expect(peakOf([day('2026-08-22', 0)])).toBe(1)
    expect(peakOf([])).toBe(1)
  })
})

describe('calendar weeks', () => {
  it('runs Sunday to Saturday, whichever day you ask about', () => {
    // 2026-09-02 is a Wednesday.
    const week = weekContaining('2026-09-02' as CalendarDate)
    expect(week).toHaveLength(7)
    expect(week[0]).toBe('2026-08-30') // Sunday
    expect(week[6]).toBe('2026-09-05') // Saturday
  })

  it('gives the same week for every day inside it', () => {
    const sunday = weekContaining('2026-08-30' as CalendarDate)
    for (const day of sunday) {
      expect(weekContaining(day), `${day} landed in a different week`).toEqual(sunday)
    }
  })

  it('files a Sunday under itself, not under the week before', () => {
    // The boundary that a naive "subtract getDay()" gets wrong.
    expect(weekStartOf('2026-08-30' as CalendarDate)).toBe('2026-08-30')
    expect(weekStartOf('2026-08-29' as CalendarDate)).toBe('2026-08-23')
  })

  it('survives the day the clocks change', () => {
    // Israel leaves DST on 2026-10-25, a Sunday. A week built by adding hours
    // rather than days would lose or gain one here.
    const week = weekContaining('2026-10-28' as CalendarDate)
    expect(week[0]).toBe('2026-10-25')
    expect(week[6]).toBe('2026-10-31')
  })

  it('steps whole weeks, landing on Sundays', () => {
    expect(addWeeks('2026-09-02' as CalendarDate, -1)).toBe('2026-08-23')
    expect(addWeeks('2026-09-02' as CalendarDate, 1)).toBe('2026-09-06')
  })
})

describe('the net compares like with like', () => {
  const day = (d: string, eaten: number, burned?: number) =>
    ({ day: d as CalendarDate, eatenKcal: eaten, ...(burned === undefined ? {} : { burnedKcal: burned }) })

  it('leaves a day with no burn out of the balance entirely', () => {
    // Six days weighed, one day of food that cannot be weighed. Counting that
    // food against nothing is what turned a real deficit into a surplus.
    const week = summariseWeek([
      day('2026-08-30', 2000, 2400),
      day('2026-08-31', 2000, 2400),
      day('2026-09-01', 2000, 2400),
      day('2026-09-02', 2200), // today: eaten, but the watch has not reported
    ])
    expect(week.balance.eatenKcal).toBe(6000)
    expect(week.balance.burnedKcal).toBe(7200)
    expect(week.balance.netKcal, 'today’s food must not count against nothing').toBe(-1200)
    expect(week.daysWithBurn).toBe(3)
  })

  it('still reports everything eaten, because it was eaten', () => {
    const week = summariseWeek([
      day('2026-08-30', 2000, 2400),
      day('2026-09-02', 2200),
    ])
    expect(week.eatenAllDays).toBe(4200)
    expect(week.balance.eatenKcal).toBe(2000)
    expect(week.daysWithFood).toBe(2)
  })

  it('ignores days that have not happened yet', () => {
    const week = summariseWeek([day('2026-08-30', 2000, 2400), day('2026-09-05', 0)])
    expect(week.daysWithFood).toBe(1)
    expect(week.balance.netKcal).toBe(-400)
  })
})

describe('a goal with no calorie target', () => {
  const flat = (eaten: number, burned: number) =>
    Array.from({ length: 7 }, (_, i) => ({
      day: `2026-08-${30 + i}` as CalendarDate,
      eatenKcal: eaten,
      burnedKcal: burned,
    }))

  it('stays ungraded, but says so when the drift is large', () => {
    const week = summariseWeek(flat(3000, 2200), 'FITNESS')
    expect(week.verdict, 'an untargeted goal is never scored').toBe('UNGRADED')
    expect(week.drift).toEqual({ direction: 'OVER', kcal: 5600 })
  })

  it('keeps quiet when the week is merely uneven', () => {
    const week = summariseWeek(flat(2300, 2200), 'FITNESS')
    expect(week.drift, '700 kcal across a week is noise').toBeUndefined()
  })

  it('names an underspend too — it is not only about eating too much', () => {
    expect(summariseWeek(flat(1500, 2200), 'FITNESS').drift).toEqual({
      direction: 'UNDER',
      kcal: 4900,
    })
  })

  it('says nothing beside a goal that already has a verdict', () => {
    const week = summariseWeek(flat(3000, 2200), 'LOSE_WEIGHT')
    expect(week.verdict).toBe('OFF_TARGET')
    expect(week.drift, 'a second opinion beside a verdict is noise').toBeUndefined()
  })
})

describe('the summary card can be read as one thing', () => {
  const d = (day: string, eaten: number, burned?: number) =>
    ({ day: day as CalendarDate, eatenKcal: eaten, ...(burned === undefined ? {} : { burnedKcal: burned }) })

  /**
   * The three numbers on the card — eaten, burned, and the net between them —
   * have to be over the same days, or they cannot be read together.
   *
   * The card divided eaten by seven while the total counted only the days with
   * a burn figure, so it reported 1,088 kcal a day where the real average was
   * 2,538: not a rounding difference, less than half. These assertions are what
   * the card computes, so the arithmetic is pinned somewhere a screenshot is
   * not the only witness.
   */
  it('averages eaten and burned over the same days', () => {
    // Three days compared, four with food but no burn figure.
    const week = summariseWeek([
      d('2026-08-30', 2600, 2400),
      d('2026-08-31', 2500, 2300),
      d('2026-09-01', 2515, 2423),
      d('2026-09-02', 1200),
      d('2026-09-03', 0),
      d('2026-09-04', 0),
      d('2026-09-05', 0),
    ])

    expect(week.daysWithBurn).toBe(3)
    expect(week.balance.eatenKcal).toBe(7615)
    expect(week.balance.burnedKcal).toBe(7123)
    expect(week.balance.netKcal).toBe(492)

    // What the card shows per day. Both over daysWithBurn, never over 7.
    expect(Math.round(week.balance.eatenKcal / week.daysWithBurn)).toBe(2538)
    expect(Math.round(week.balance.burnedKcal / week.daysWithBurn)).toBe(2374)

    // And the eating left out of the balance is still known, so it can be said.
    expect(week.eatenAllDays).toBe(8815)
    expect(week.eatenAllDays - week.balance.eatenKcal).toBe(1200)
  })

  it('keeps net equal to eaten minus burned, whatever is missing', () => {
    // The invariant the card depends on: three numbers, one subtraction.
    const weeks = [
      [d('2026-08-30', 2000, 2400), d('2026-08-31', 1800)],
      [d('2026-08-30', 2000, 2400), d('2026-08-31', 2200, 2100)],
      [d('2026-08-30', 0, 2400), d('2026-08-31', 3000)],
    ]
    for (const days of weeks) {
      const week = summariseWeek(days)
      expect(week.balance.netKcal).toBe(week.balance.eatenKcal - week.balance.burnedKcal)
    }
  })
})
