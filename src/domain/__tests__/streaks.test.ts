import { describe, expect, it } from 'vitest'
import { dayOutcome, streakOf, summariseTargets, type DayRecord } from '../streaks'
import { ownGoal, type Goal } from '../goals'
import { canonical, type CalendarDate } from '..'

const TODAY = '2026-11-21' as CalendarDate
const day = (offset: number) => {
  const d = new Date(`${TODAY}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10) as CalendarDate
}
const hit = (offset: number): DayRecord => ({ day: day(offset), outcome: 'HIT' })
const miss = (offset: number, outcome: DayRecord['outcome'] = 'OVER'): DayRecord => ({ day: day(offset), outcome })

describe('a day against its target', () => {
  it('counts within 10% either way', () => {
    expect(dayOutcome(2000, 1810, true)).toBe('HIT')
    expect(dayOutcome(2000, 2200, true)).toBe('HIT')
  })
  it('is over or under past that', () => {
    expect(dayOutcome(2000, 2210, true)).toBe('OVER')
    expect(dayOutcome(2000, 1790, true)).toBe('UNDER')
  })
  it('a day nobody logged is not logged, whatever its total', () => {
    expect(dayOutcome(2000, 2000, false)).toBe('NOT_LOGGED')
  })
})

describe('the streak', () => {
  it('counts back from yesterday while today is still in progress', () => {
    expect(streakOf([hit(-3), hit(-2), hit(-1), miss(0, 'UNDER')], TODAY)).toEqual({ days: 3, throughToday: false })
  })
  it('includes today once today is on target', () => {
    expect(streakOf([hit(-2), hit(-1), hit(0)], TODAY)).toEqual({ days: 3, throughToday: true })
  })
  it('stops at the first day that was not', () => {
    expect(streakOf([hit(-4), miss(-3), hit(-2), hit(-1)], TODAY).days).toBe(2)
    expect(streakOf([hit(-3), miss(-2, 'NOT_LOGGED'), hit(-1)], TODAY).days).toBe(1)
  })
  it('a day with no targets breaks it too', () => {
    expect(streakOf([hit(-3), { day: day(-2) }, hit(-1)], TODAY).days).toBe(1)
  })
  it('is zero with nothing behind it', () => {
    expect(streakOf([], TODAY)).toEqual({ days: 0, throughToday: false })
  })
})

it('a stretch of days, summed up', () => {
  const records: DayRecord[] = [
    { ...hit(-2), proteinReached: true },
    { ...miss(-1), proteinReached: false },
    { ...hit(0), proteinReached: true },
    { day: day(1) },
  ]
  expect(summariseTargets(records)).toEqual({ counted: 3, hit: 2, proteinReached: 2 })
})

describe('a goal of your own', () => {
  const goal = (target: number, at: string): Goal =>
    ({
      id: `g-${at}`,
      userId: 'u',
      metric: 'PROTEIN',
      direction: 'AT_LEAST',
      target: canonical(target, 'g'),
      startsOn: TODAY,
      active: true,
      provenance: { source: 'USER', recordedAt: at },
    }) as unknown as Goal

  it('is the newest one', () => {
    expect(ownGoal([goal(140, '2026-11-01T00:00:00Z'), goal(160, '2026-11-02T00:00:00Z')], 'PROTEIN')?.target.value).toBe(160)
  })
  it('is gone once the newest says 0, back to automatic', () => {
    expect(ownGoal([goal(140, '2026-11-01T00:00:00Z'), goal(0, '2026-11-02T00:00:00Z')], 'PROTEIN')).toBeUndefined()
  })
})
