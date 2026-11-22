import { describe, expect, it } from 'vitest'
import { resolveObjectives, type Objective } from '../objectives'
import { chosenObjectives, type Goal } from '../goals'
import { dailyTargets, type TargetsInput } from '../targets'

/** Several goals at once (docs/features/several-goals.md), every row of the table. */

const lead = (...chosen: Objective[]) => resolveObjectives(chosen)?.lead

describe('which goal leads the calories', () => {
  it('losing and building together is "lose fat, keep muscle"', () => {
    expect(lead('LOSE_WEIGHT', 'BUILD_MUSCLE')).toBe('LOSE_FAT')
    expect(lead('LOSE_FAT', 'BUILD_MUSCLE')).toBe('LOSE_FAT')
    expect(resolveObjectives(['LOSE_WEIGHT', 'BUILD_MUSCLE'])?.recomposition).toBe(true)
  })
  it('losing weight leads anything but building', () => {
    expect(lead('LOSE_WEIGHT', 'LOSE_FAT')).toBe('LOSE_WEIGHT')
    expect(lead('LOSE_WEIGHT', 'MAINTAIN', 'FITNESS')).toBe('LOSE_WEIGHT')
  })
  it('keeping weight with building stays level', () => {
    expect(lead('MAINTAIN', 'BUILD_MUSCLE')).toBe('MAINTAIN')
  })
  it('building alone, keeping alone', () => {
    expect(lead('BUILD_MUSCLE', 'FITNESS')).toBe('BUILD_MUSCLE')
    expect(lead('MAINTAIN')).toBe('MAINTAIN')
  })
  it('general fitness never moves the calories, and leads only alone', () => {
    expect(lead('FITNESS')).toBe('FITNESS')
    expect(lead('FITNESS', 'LOSE_FAT')).toBe('LOSE_FAT')
  })
  it('nothing chosen is nothing resolved', () => {
    expect(resolveObjectives([])).toBeUndefined()
  })
  it('the choice comes back in the usual order, once each', () => {
    expect(resolveObjectives(['FITNESS', 'LOSE_WEIGHT', 'FITNESS'])?.chosen).toEqual(['LOSE_WEIGHT', 'FITNESS'])
  })
})

describe('the targets follow the combination', () => {
  const person: TargetsInput = {
    weightKg: 80,
    heightCm: 178,
    ageYears: 36,
    sex: 'MALE',
    activity: 'MODERATE',
    burnHistory: [2600, 2600, 2600, 2600, 2600],
  }
  const targets = (objectives: Objective[]) => {
    const resolved = resolveObjectives(objectives)!
    const result = dailyTargets({ ...person, objective: resolved.lead, objectives: resolved.chosen })
    if (!result.ok) throw new Error('expected targets')
    return result.targets
  }
  it('protein is the highest any chosen goal asks for', () => {
    // Keep weight (1.4) with build muscle (1.8): 1.8 × 80 = 144, to 145.
    expect(targets(['MAINTAIN', 'BUILD_MUSCLE']).proteinG).toBe(145)
    // Level calories.
    expect(targets(['MAINTAIN', 'BUILD_MUSCLE']).energyKcal).toBe(2600)
  })
  it('lose weight with build muscle: 350 under, protein 2.0 per kilo', () => {
    const t = targets(['LOSE_WEIGHT', 'BUILD_MUSCLE'])
    expect(t.energyKcal).toBe(2250)
    expect(t.proteinG).toBe(160)
    expect(t.objectives).toEqual(['LOSE_WEIGHT', 'BUILD_MUSCLE'])
  })
  it('a single goal is exactly as before', () => {
    const single = dailyTargets({ ...person, objective: 'BUILD_MUSCLE' })
    expect(single.ok && single.targets.energyKcal).toBe(2850)
    expect(single.ok && single.targets.objectives).toEqual(['BUILD_MUSCLE'])
  })
})

describe('goals saved before several could be chosen', () => {
  const goal = (fields: Partial<Goal>) => fields as Goal
  it('read as the one goal they carry', () => {
    expect(chosenObjectives(goal({ objective: 'LOSE_FAT' }))).toEqual(['LOSE_FAT'])
  })
  it('and new ones as everything chosen', () => {
    expect(chosenObjectives(goal({ objective: 'LOSE_FAT', objectives: ['LOSE_WEIGHT', 'BUILD_MUSCLE'] }))).toEqual([
      'LOSE_WEIGHT',
      'BUILD_MUSCLE',
    ])
  })
  it('none at all, when nothing was ever chosen', () => {
    expect(chosenObjectives(undefined)).toEqual([])
  })
})
