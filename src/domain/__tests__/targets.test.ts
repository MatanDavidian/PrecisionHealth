import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_FACTOR,
  ageOn,
  dailyTargets,
  dayProgress,
  measuredBurn,
  MIN_MEASURED_DAYS,
  proteinWeightKg,
  restingKcal,
  type TargetsInput,
} from '../targets'

/** A complete person with no watch: the formula path. */
const person: TargetsInput = {
  objective: 'MAINTAIN',
  weightKg: 72.8,
  heightCm: 178,
  ageYears: 36,
  sex: 'MALE',
  activity: 'MODERATE',
  burnHistory: [],
}

const targetsOf = (input: TargetsInput) => {
  const result = dailyTargets(input)
  if (!result.ok) throw new Error(`expected targets, missing ${result.missing.join(', ')}`)
  return result.targets
}

describe('resting energy (Mifflin–St Jeor)', () => {
  it('matches the worked example for a man', () => {
    // 10 × 72.8 + 6.25 × 178 − 5 × 36 + 5
    expect(restingKcal({ weightKg: 72.8, heightCm: 178, ageYears: 36, sex: 'MALE' })).toBeCloseTo(1665.5, 5)
  })

  it('matches the worked example for a woman', () => {
    // 10 × 60 + 6.25 × 165 − 5 × 30 − 161
    expect(restingKcal({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'FEMALE' })).toBeCloseTo(1320.25, 5)
  })

  it('takes the halfway constant when sex is not given', () => {
    const male = restingKcal({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'MALE' })
    const female = restingKcal({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'FEMALE' })
    const unsaid = restingKcal({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'UNDISCLOSED' })
    expect(unsaid).toBeCloseTo((male + female) / 2, 5)
  })
})

describe('measured burn', () => {
  it('is the average once there are enough days', () => {
    expect(measuredBurn([2300, 2400, 2500, 2600, 2700])).toEqual({ kcal: 2500, days: 5 })
  })

  it('is not trusted on fewer days', () => {
    expect(measuredBurn(Array(MIN_MEASURED_DAYS - 1).fill(2400))).toBeUndefined()
  })

  it('ignores blanks and zeros rather than averaging them in', () => {
    expect(measuredBurn([2400, 0, 2400, Number.NaN, 2400, 2400, 2400])).toEqual({ kcal: 2400, days: 5 })
  })
})

describe('calories', () => {
  it('maintain: the estimated burn itself, rounded to 10', () => {
    const t = targetsOf(person)
    // 1665.5 × 1.5 = 2498.25
    expect(t.burn).toMatchObject({ kind: 'ESTIMATED', activity: 'MODERATE' })
    expect(t.energyKcal).toBe(2500)
    expect(t.balanceKcal).toBe(0)
  })

  it.each([
    ['LOSE_WEIGHT', -500],
    ['LOSE_FAT', -350],
    ['BUILD_MUSCLE', 250],
    ['MAINTAIN', 0],
    ['FITNESS', 0],
  ] as const)('%s moves the target by the same balance the week is graded on (%i)', (objective, balance) => {
    const burn = 1665.5 * ACTIVITY_FACTOR.MODERATE
    expect(targetsOf({ ...person, objective }).energyKcal).toBe(Math.round((burn + balance) / 10) * 10)
  })

  it('prefers the watch over the formula when it has enough days', () => {
    const t = targetsOf({ ...person, burnHistory: [2800, 2800, 2800, 2800, 2800] })
    expect(t.burn).toEqual({ kind: 'MEASURED', kcal: 2800, days: 5 })
    expect(t.energyKcal).toBe(2800)
  })

  it('falls back to the formula while the watch has too few days', () => {
    expect(targetsOf({ ...person, burnHistory: [2800, 2800] }).burn.kind).toBe('ESTIMATED')
  })

  it('never goes below the floor, and says it was raised', () => {
    const small = { ...person, objective: 'LOSE_WEIGHT' as const, sex: 'FEMALE' as const, weightKg: 48, heightCm: 152, ageYears: 60, activity: 'LOW' as const }
    const t = targetsOf(small)
    expect(t.energyKcal).toBe(1200)
    expect(t.floored).toBe(true)
  })

  it('uses the higher floor for a man', () => {
    const t = targetsOf({ ...person, objective: 'LOSE_WEIGHT', burnHistory: [1700, 1700, 1700, 1700, 1700] })
    expect(t.energyKcal).toBe(1500)
    expect(t.floored).toBe(true)
  })

  it('is not marked floored when the floor did nothing', () => {
    expect(targetsOf(person).floored).toBe(false)
  })
})

describe('protein, fat and carbs', () => {
  it('protein is grams per kilo by objective, rounded to 5', () => {
    expect(targetsOf({ ...person, objective: 'MAINTAIN' }).proteinG).toBe(100) // 1.4 × 72.8 = 101.9
    expect(targetsOf({ ...person, objective: 'LOSE_FAT' }).proteinG).toBe(145) // 2.0 × 72.8 = 145.6
    expect(targetsOf({ ...person, objective: 'BUILD_MUSCLE' }).proteinG).toBe(130) // 1.8 × 72.8 = 131
  })

  it('counts protein against the target weight when losing toward a lower one', () => {
    expect(proteinWeightKg('LOSE_WEIGHT', 120, 90)).toBe(90)
    expect(proteinWeightKg('LOSE_FAT', 80, 85)).toBe(80)
    expect(proteinWeightKg('BUILD_MUSCLE', 70, 60)).toBe(70)
    const t = targetsOf({ ...person, objective: 'LOSE_WEIGHT', weightKg: 120, targetKg: 90 })
    expect(t.protein).toEqual({ from: 'RULE', perKg: 1.6, weightKg: 90 })
    expect(t.proteinG).toBe(145) // 1.6 × 90 = 144
  })

  it('a protein goal the person set wins over the rule', () => {
    const t = targetsOf({ ...person, proteinGoalG: 160 })
    expect(t.proteinG).toBe(160)
    expect(t.protein).toEqual({ from: 'GOAL' })
  })

  it('fat is 30% of the calories, and carbs take the rest', () => {
    const t = targetsOf(person)
    expect(t.fatG).toBe(85) // 2500 × 0.3 / 9 = 83.3
    expect(t.carbsG).toBe(335) // (2500 − 400 − 765) / 4 = 333.75
    // The three add back up to the calories, within the rounding.
    expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.energyKcal)).toBeLessThan(40)
  })

  it('carbs never go below zero', () => {
    const t = targetsOf({ ...person, objective: 'LOSE_WEIGHT', proteinGoalG: 400 })
    expect(t.carbsG).toBe(0)
  })
})

describe('what is missing', () => {
  it('lists everything that stands in the way, in order', () => {
    expect(dailyTargets({ burnHistory: [] })).toEqual({ ok: false, missing: ['OBJECTIVE', 'WEIGHT', 'BURN'] })
  })

  it('needs no profile when the watch knows the burn', () => {
    const result = dailyTargets({ objective: 'MAINTAIN', weightKg: 70, burnHistory: [2400, 2400, 2400, 2400, 2400] })
    expect(result.ok).toBe(true)
  })

  it('without a watch, needs height, age and activity', () => {
    expect(dailyTargets({ ...person, heightCm: undefined })).toEqual({ ok: false, missing: ['BURN'] })
    expect(dailyTargets({ ...person, ageYears: undefined })).toEqual({ ok: false, missing: ['BURN'] })
    expect(dailyTargets({ ...person, activity: undefined })).toEqual({ ok: false, missing: ['BURN'] })
  })

  it('a missing weight is reported even when the watch has the burn', () => {
    expect(dailyTargets({ objective: 'MAINTAIN', burnHistory: [2400, 2400, 2400, 2400, 2400] })).toEqual({
      ok: false,
      missing: ['WEIGHT'],
    })
  })
})

describe('the day against its targets', () => {
  const targets = { energyKcal: 2000, proteinG: 140, carbsG: 220, fatG: 65 }
  const eaten = (energyKcal: number, proteinG = 0) => ({ energyKcal, proteinG, carbsG: 100, fatG: 30 })

  it('calories under the target say how much is left', () => {
    const p = dayProgress(targets, eaten(1200))
    expect(p.energy).toMatchObject({ state: 'UNDER', remaining: 800, share: 0.6 })
  })

  it('within 5% either way is on target', () => {
    expect(dayProgress(targets, eaten(1905)).energy.state).toBe('ON_TARGET')
    expect(dayProgress(targets, eaten(2100)).energy.state).toBe('ON_TARGET')
  })

  it('past the band is over, with how far', () => {
    const p = dayProgress(targets, eaten(2190))
    expect(p.energy.state).toBe('OVER')
    expect(p.energy.remaining).toBe(-190)
  })

  it('protein is reached at the target, not before', () => {
    expect(dayProgress(targets, eaten(1000, 139)).protein.state).toBe('UNDER')
    expect(dayProgress(targets, eaten(1000, 140)).protein.state).toBe('REACHED')
  })

  it('carbs and fat carry the numbers and no verdict', () => {
    const p = dayProgress(targets, eaten(1000))
    expect(p.carbs).toEqual({ eaten: 100, target: 220, share: 100 / 220, remaining: 120 })
    expect(p.fat).not.toHaveProperty('state')
  })
})

it('age comes from the year of birth', () => {
  expect(ageOn('2026-11-21', 1990)).toBe(36)
})
