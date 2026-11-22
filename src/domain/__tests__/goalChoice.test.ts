import { describe, expect, it } from 'vitest'
import { choiceFromObjectives, goalChoiceOf, leadObjective, proteinPerKg, wantsTargetWeight, type GoalChoice } from '../goalChoice'
import { dailyTargets, type TargetsInput } from '../targets'

/** Goals as two answers (docs/features/several-goals.md, revised 2026-11-22). */

const c = (aim: GoalChoice['aim'], ...focus: GoalChoice['focus']): GoalChoice => ({ aim, focus })

describe('the goal that leads the calories', () => {
  it('losing alone is losing weight; losing with muscle or body fat is "lose fat, keep muscle"', () => {
    expect(leadObjective(c('LOSE'))).toBe('LOSE_WEIGHT')
    expect(leadObjective(c('LOSE', 'MUSCLE'))).toBe('LOSE_FAT')
    expect(leadObjective(c('LOSE', 'FAT'))).toBe('LOSE_FAT')
    expect(leadObjective(c('LOSE', 'FITNESS'))).toBe('LOSE_WEIGHT')
  })
  it('keeping is level whatever else; gaining is the surplus; no weight goal is a guide', () => {
    expect(leadObjective(c('KEEP', 'MUSCLE', 'FAT'))).toBe('MAINTAIN')
    expect(leadObjective(c('GAIN', 'FAT'))).toBe('BUILD_MUSCLE')
    expect(leadObjective(c('NONE', 'MUSCLE'))).toBe('FITNESS')
  })
})

describe('protein per kilo', () => {
  it.each([
    [c('LOSE'), 1.6],
    [c('LOSE', 'MUSCLE'), 2.0],
    [c('LOSE', 'FAT'), 2.0],
    [c('KEEP'), 1.4],
    [c('KEEP', 'MUSCLE'), 1.8],
    [c('KEEP', 'FAT'), 2.0],
    [c('KEEP', 'FITNESS'), 1.6],
    [c('GAIN'), 1.8],
    [c('GAIN', 'FAT'), 2.0],
    [c('NONE'), 1.6],
    [c('NONE', 'MUSCLE'), 1.8],
  ])('%o asks for %d', (choice, rate) => {
    expect(proteinPerKg(choice)).toBe(rate)
  })
})

it('a target weight belongs only to losing and gaining', () => {
  expect(wantsTargetWeight(c('LOSE'))).toBe(true)
  expect(wantsTargetWeight(c('GAIN'))).toBe(true)
  expect(wantsTargetWeight(c('KEEP', 'FAT'))).toBe(false)
  expect(wantsTargetWeight(c('NONE'))).toBe(false)
  expect(wantsTargetWeight(undefined)).toBe(false)
})

describe('goals saved before the two answers', () => {
  it('a single goal reads as its answers', () => {
    expect(choiceFromObjectives(['LOSE_WEIGHT'])).toEqual(c('LOSE'))
    expect(choiceFromObjectives(['LOSE_FAT'])).toEqual(c('LOSE', 'FAT'))
    expect(choiceFromObjectives(['BUILD_MUSCLE'])).toEqual(c('GAIN', 'MUSCLE'))
    expect(choiceFromObjectives(['MAINTAIN'])).toEqual(c('KEEP'))
    expect(choiceFromObjectives(['FITNESS'])).toEqual(c('NONE', 'FITNESS'))
  })
  it('the day of several goals reads sensibly too', () => {
    expect(choiceFromObjectives(['LOSE_WEIGHT', 'BUILD_MUSCLE', 'FITNESS'])).toEqual(c('LOSE', 'MUSCLE', 'FITNESS'))
    expect(choiceFromObjectives(['MAINTAIN', 'BUILD_MUSCLE'])).toEqual(c('KEEP', 'MUSCLE'))
  })
  it('a goal with its answers is read as saved, and nothing is nothing', () => {
    expect(goalChoiceOf({ choice: c('KEEP', 'FAT'), objective: 'MAINTAIN' })).toEqual(c('KEEP', 'FAT'))
    expect(goalChoiceOf({ objective: 'LOSE_FAT' })).toEqual(c('LOSE', 'FAT'))
    expect(goalChoiceOf(undefined)).toBeUndefined()
  })
  it('unknown words in a saved choice are dropped, not trusted', () => {
    expect(goalChoiceOf({ choice: { aim: 'KEEP', focus: ['FAT', 'TELEPORT'] } })).toEqual(c('KEEP', 'FAT'))
  })
})

describe('the targets follow the answers', () => {
  const person: TargetsInput = { weightKg: 80, burnHistory: [2600, 2600, 2600, 2600, 2600] }
  const targets = (choice: GoalChoice) => {
    const r = dailyTargets({ ...person, objective: leadObjective(choice), choice })
    if (!r.ok) throw new Error('expected targets')
    return r.targets
  }
  it('same weight, less fat: level calories, protein 2.0 per kilo', () => {
    const t = targets(c('KEEP', 'FAT'))
    expect(t.energyKcal).toBe(2600)
    expect(t.proteinG).toBe(160)
    expect(t.choice).toEqual(c('KEEP', 'FAT'))
  })
  it('lose and lower body fat: 350 under, protein 2.0 per kilo', () => {
    const t = targets(c('LOSE', 'FAT'))
    expect(t.energyKcal).toBe(2250)
    expect(t.proteinG).toBe(160)
  })
})
