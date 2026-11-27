import { describe, expect, it } from 'vitest'
import {
  BEDTIME_MAX_KCAL,
  carbFocus,
  fatLow,
  minutesToBedtime,
  proteinPerSitting,
  suggestPlan,
  trainingCredit,
  usualBedtime,
} from '../suggestions'
import { burnCalibration, dismissedRecently, weightSlope, type CalibrationDay, type WeighIn } from '../burnCalibration'
import { dailyTargets, dayProgress, type TargetsInput } from '../targets'

/** 28 days before 2026-12-01, oldest first. */
const DAYS = Array.from({ length: 28 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 3 + i))
  return d.toISOString().slice(0, 10)
})

describe('Phase 3: today’s training, counted', () => {
  const usual = Array.from({ length: 10 }, (_, i) => ({ day: `2026-11-${String(10 + i).padStart(2, '0')}`, kcal: 400, source: 'GARMIN' }))
  const today = { day: '2026-11-25', kcal: 780, source: 'GARMIN' }

  it('half of the activity beyond the usual day counts', () => {
    expect(trainingCredit({ today, history: usual, ownTarget: false })).toEqual({
      activeKcal: 780,
      baselineKcal: 400,
      extraKcal: 380,
      creditKcal: 190,
      baselineDays: 10,
    })
  })

  it('nothing for a usual day or less: the usual burn already holds it, and a quiet morning is not a quiet day', () => {
    expect(trainingCredit({ today: { ...today, kcal: 400 }, history: usual, ownTarget: false })).toBeUndefined()
    expect(trainingCredit({ today: { ...today, kcal: 120 }, history: usual, ownTarget: false })).toBeUndefined()
  })

  it('compares the same source only, and needs five earlier days of it', () => {
    const other = usual.map((r) => ({ ...r, source: 'APPLE_HEALTH' }))
    expect(trainingCredit({ today, history: other, ownTarget: false })).toBeUndefined()
    expect(trainingCredit({ today, history: usual.slice(0, 4), ownTarget: false })).toBeUndefined()
  })

  it('never on a calorie target the person typed in', () => {
    expect(trainingCredit({ today, history: usual, ownTarget: true })).toBeUndefined()
  })
})

describe('Phase 4: better food choices', () => {
  it('protein per sitting: about 0.4 g per kg, at most 0.5', () => {
    expect(proteinPerSitting(72.8)).toEqual({ aimG: 29, maxG: 36 })
  })

  it('carbs by training: refuel after an hour of endurance, moderate after other training, modest on a rest day', () => {
    expect(carbFocus([{ kind: 'RUNNING', minutes: 75 }])).toBe('REFUEL')
    expect(carbFocus([{ kind: 'RUNNING', minutes: 30 }, { kind: 'CYCLING', minutes: 30 }])).toBe('REFUEL')
    expect(carbFocus([{ kind: 'RUNNING', minutes: 40 }])).toBe('MODERATE')
    expect(carbFocus([{ kind: 'STRENGTH', minutes: 62 }])).toBe('MODERATE')
    expect(carbFocus([])).toBe('MODEST')
  })

  it('the fat floor: under 0.5 g per kg a day over the counted days', () => {
    expect(fatLow({ fatEatenG: 4 * 30, days: 4, sparse: false }, 72.8)).toBe(true)
    expect(fatLow({ fatEatenG: 4 * 40, days: 4, sparse: false }, 72.8)).toBe(false)
    expect(fatLow({ fatEatenG: 0, days: 1, sparse: true }, 72.8)).toBe(false)
    expect(fatLow({ fatEatenG: 40, days: 4, sparse: false }, undefined)).toBe(false)
  })

  it('the usual bedtime, past midnight counted as late evening', () => {
    expect(usualBedtime(['23:10', '23:40', '00:20', '23:30', '23:50'])).toBe('23:40')
    expect(usualBedtime(['23:10', '23:40'])).toBeUndefined()
  })

  it('within three hours of bedtime, the minutes left; otherwise none', () => {
    expect(minutesToBedtime('21:30', '23:30')).toBe(120)
    expect(minutesToBedtime('23:00', '00:30')).toBe(90)
    expect(minutesToBedtime('19:00', '23:30')).toBeUndefined()
    expect(minutesToBedtime('23:45', '23:30')).toBeUndefined()
  })

  it('close to bedtime, filling the day is capped at 400 kcal', () => {
    const progress = dayProgress({ energyKcal: 2150, proteinG: 145, carbsG: 235, fatG: 70 }, { energyKcal: 1000, proteinG: 60, carbsG: 120, fatG: 30 })
    expect(suggestPlan(progress, undefined, [], { nearBedtime: true })).toEqual({ kind: 'FILL', maxKcal: BEDTIME_MAX_KCAL, bedtime: true })
    expect(suggestPlan(progress)).toEqual({ kind: 'FILL', maxKcal: 1265 })
  })
})

describe('Phase 5: the real burn, learned from the weight', () => {
  const days = (eaten: number, used = 2400, complete = (_i: number) => true): CalibrationDay[] =>
    DAYS.map((day, i) => ({ day, eatenKcal: eaten, complete: complete(i), usedBurnKcal: used }))
  /** Weigh-ins every 4 days, on a line from `start` changing by `perDay` kg a day. */
  const weighIns = (start: number, perDay: number, noise = 0): WeighIn[] =>
    DAYS.filter((_, i) => i % 4 === 0 || i === 27).map((day, i) => ({
      day,
      kg: start + perDay * DAYS.indexOf(day) + (i % 2 ? noise : -noise),
    }))

  it('the slope of the weigh-ins, by least squares', () => {
    expect(weightSlope(weighIns(80, -0.05))).toBeCloseTo(-0.05, 6)
  })

  it('eating 2,000 at a steady weight is a burn of 2,000: offered when 2,400 is in use, 17% less', () => {
    expect(burnCalibration(days(2000), weighIns(80, 0))).toEqual({
      status: 'OFFER',
      trendKcal: 2000,
      usedKcal: 2400,
      discrepancy: expect.closeTo(-0.167, 2),
      factor: 0.83,
    })
    // Scale noise of ±0.3 kg moves the answer a little, not the decision.
    const noisy = burnCalibration(days(2000), weighIns(80, 0, 0.3))
    expect(noisy.status).toBe('OFFER')
    if (noisy.status === 'OFFER') expect(Math.abs(noisy.trendKcal - 2000)).toBeLessThanOrEqual(100)
  })

  it('losing what the plan says agrees with the burn in use', () => {
    // 400 a day under 2,400: about 0.052 kg a day.
    expect(burnCalibration(days(2000), weighIns(80, -400 / 7700))).toMatchObject({ status: 'AGREES', trendKcal: 2400 })
  })

  it('a gap in one half only is not persistent: no offer', () => {
    // Steady for two weeks, then losing fast: the halves disagree.
    const ins: WeighIn[] = DAYS.filter((_, i) => i % 3 === 0 || i === 27).map((day) => {
      const i = DAYS.indexOf(day)
      return { day, kg: i < 14 ? 80 : 80 - 0.15 * (i - 14) }
    })
    expect(burnCalibration(days(2400), ins).status).not.toBe('OFFER')
  })

  it('more than 30% apart is unclear: probably meals missing from the log', () => {
    expect(burnCalibration(days(1400), weighIns(80, 0)).status).toBe('UNCLEAR')
  })

  it('not enough: few complete days, few weigh-ins, or none early or late', () => {
    expect(burnCalibration(days(2000, 2400, (i) => i % 2 === 0), weighIns(80, 0))).toEqual({
      status: 'NOT_ENOUGH',
      completeDays: 14,
      weighIns: 8,
    })
    expect(burnCalibration(days(2000), weighIns(80, 0).slice(0, 5)).status).toBe('NOT_ENOUGH')
    expect(burnCalibration(days(2000).slice(0, 20), weighIns(80, 0)).status).toBe('NOT_ENOUGH')
  })

  it('"Not now" holds for two weeks', () => {
    const now = new Date('2026-12-01T12:00:00Z')
    expect(dismissedRecently('2026-11-25T12:00:00Z', now)).toBe(true)
    expect(dismissedRecently('2026-11-10T12:00:00Z', now)).toBe(false)
    expect(dismissedRecently(undefined, now)).toBe(false)
  })

  it('an approved correction multiplies the usual burn, and says so in the basis', () => {
    const person: TargetsInput = {
      objective: 'LOSE_FAT',
      weightKg: 72.8,
      heightCm: 178,
      ageYears: 36,
      sex: 'MALE',
      activity: 'MODERATE',
      burnHistory: [],
    }
    const plain = dailyTargets(person)
    const corrected = dailyTargets({ ...person, burnFactor: 0.9 })
    if (!plain.ok || !corrected.ok) throw new Error('expected targets')
    expect(corrected.targets.burn).toMatchObject({ factor: 0.9, uncorrectedKcal: plain.targets.burn!.kcal })
    expect(corrected.targets.burn!.kcal).toBeCloseTo(plain.targets.burn!.kcal * 0.9, 6)
    expect(corrected.targets.energyKcal).toBeLessThan(plain.targets.energyKcal)
    expect(dailyTargets({ ...person, burnFactor: 1 })).toEqual(plain)
  })
})
