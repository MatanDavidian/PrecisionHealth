import { describe, expect, it } from 'vitest'
import {
  LEVEL_TOLERANCE_KCAL,
  OBJECTIVES,
  OBJECTIVE_SHAPE,
  balanceOf,
  isObjective,
  verdictFor,
  weekAimKcal,
  weekGapKcal,
} from '../objectives'

describe('the balance', () => {
  it('is negative when you burned more than you ate', () => {
    expect(balanceOf(2000, 2400).netKcal).toBe(-400)
  })

  it('is positive when you ate more than you burned', () => {
    expect(balanceOf(2600, 2400).netKcal).toBe(200)
  })
})

describe('what each objective asks for over a week', () => {
  it('multiplies the daily rate by the days', () => {
    expect(weekAimKcal('LOSE_WEIGHT')).toBe(-3500)
    expect(weekAimKcal('BUILD_MUSCLE')).toBe(1750)
    expect(weekAimKcal('MAINTAIN')).toBe(0)
  })

  it('asks for nothing when the objective sets no calorie target', () => {
    // Null, not zero: "eat what you burn" and "I am not counting" are
    // different answers and grade differently.
    expect(weekAimKcal('FITNESS')).toBeNull()
    expect(weekAimKcal('MAINTAIN')).toBe(0)
  })

  it('scales to a shorter stretch', () => {
    expect(weekAimKcal('LOSE_WEIGHT', 3)).toBe(-1500)
  })
})

describe('grading a week', () => {
  it('treats a deficit target as a ceiling, not a line to hit', () => {
    // Going further under is a harder week, not a failure.
    expect(verdictFor(-3500, -3500)).toBe('ON_TRACK')
    expect(verdictFor(-4200, -3500)).toBe('ON_TRACK')
    expect(verdictFor(-2000, -3500)).toBe('OFF_TARGET')
  })

  it('mirrors that for a surplus', () => {
    expect(verdictFor(1750, 1750)).toBe('ON_TRACK')
    expect(verdictFor(2400, 1750)).toBe('ON_TRACK')
    expect(verdictFor(500, 1750)).toBe('OFF_TARGET')
  })

  it('grades "keep this weight" in both directions, because both errors are the same error', () => {
    expect(verdictFor(0, 0)).toBe('ON_TRACK')
    expect(verdictFor(LEVEL_TOLERANCE_KCAL - 1, 0)).toBe('ON_TRACK')
    expect(verdictFor(-(LEVEL_TOLERANCE_KCAL - 1), 0)).toBe('ON_TRACK')
    expect(verdictFor(LEVEL_TOLERANCE_KCAL + 1, 0)).toBe('OFF_TARGET')
    expect(verdictFor(-(LEVEL_TOLERANCE_KCAL + 1), 0)).toBe('OFF_TARGET')
  })

  it('refuses to grade an objective that set no target', () => {
    // Scoring someone against a target they never set would be inventing one.
    expect(verdictFor(-3500, null)).toBe('UNGRADED')
    expect(verdictFor(9999, null)).toBe('UNGRADED')
  })

  it('reports no gap when there is nothing to measure against', () => {
    expect(weekGapKcal(-3500, null)).toBe(0)
    expect(weekGapKcal(-3000, -3500)).toBe(500)
  })
})

describe('the objectives themselves', () => {
  it('offers exactly the five intents people hold', () => {
    expect(OBJECTIVES).toHaveLength(5)
  })

  it('asks for a target weight only where a number on the scale is the point', () => {
    expect(OBJECTIVE_SHAPE.LOSE_WEIGHT.wantsTarget).toBe(true)
    expect(OBJECTIVE_SHAPE.BUILD_MUSCLE.wantsTarget).toBe(true)
    expect(OBJECTIVE_SHAPE.MAINTAIN.wantsTarget).toBe(false)
    expect(OBJECTIVE_SHAPE.FITNESS.wantsTarget).toBe(false)
  })

  it('recognises its own keys and rejects anything else', () => {
    expect(isObjective('LOSE_FAT')).toBe(true)
    expect(isObjective('lose_fat')).toBe(false)
    expect(isObjective(undefined)).toBe(false)
    expect(isObjective('GET_SWOLE')).toBe(false)
  })
})
