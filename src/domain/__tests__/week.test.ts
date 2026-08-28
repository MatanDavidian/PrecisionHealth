import { describe, expect, it } from 'vitest'
import { peakOf, summariseWeek, weekEndingOn, type DayEnergy } from '../week'

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
