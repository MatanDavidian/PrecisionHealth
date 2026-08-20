import { describe, expect, it } from 'vitest'
import {
  applyGramsHint,
  kcalFromMacros,
  MACRO_MISMATCH_FLAG,
  validateEstimate,
} from '../validate'
import { EstimateError } from '../estimator'

const good = {
  items: [
    { name: 'Chicken breast', amountG: 170, energyKcal: 281, proteinG: 53, carbsG: 0, fatG: 6, confidence: 0.72 },
  ],
  overallConfidence: 0.72,
  assumptions: ['Assumed cooked weight.'],
}

describe('validating a model reply', () => {
  it('accepts a well-formed estimate', () => {
    const result = validateEstimate(good, 'test-model')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].proteinG).toBe(53)
    expect(result.overallConfidence).toBeCloseTo(0.72)
    expect(result.flags).toEqual([])
  })

  it('accepts numbers sent as strings, because models do that', () => {
    const result = validateEstimate(
      { ...good, items: [{ ...good.items[0], proteinG: '53', amountG: '170' }] },
      'm',
    )
    expect(result.items[0].proteinG).toBe(53)
    expect(result.items[0].amountG).toBe(170)
  })

  it('clamps a nonsense confidence instead of rejecting the estimate', () => {
    const result = validateEstimate({ ...good, items: [{ ...good.items[0], confidence: 7 }] }, 'm')
    expect(result.items[0].confidence).toBe(1)
  })

  it('floors negative quantities at zero', () => {
    const result = validateEstimate({ ...good, items: [{ ...good.items[0], fatG: -5 }] }, 'm')
    expect(result.items[0].fatG).toBe(0)
  })

  it('flags macros that do not add up, without rejecting them', () => {
    // 53g protein + 0 carbs + 6g fat = 266 kcal, but the model claimed 900.
    const result = validateEstimate({ ...good, items: [{ ...good.items[0], energyKcal: 900 }] }, 'm')
    expect(result.flags).toContain(MACRO_MISMATCH_FLAG)
    expect(result.items[0].energyKcal).toBe(900) // still shown; the user decides
  })

  it('treats a refusal as a valid answer, not a failure', () => {
    const result = validateEstimate({ refusal: 'This is a picture of a laptop.', items: [] }, 'm')
    expect(result.refusal).toContain('laptop')
    expect(result.items).toEqual([])
  })

  it('rejects a reply with no items', () => {
    expect(() => validateEstimate({ items: [] }, 'm')).toThrow(EstimateError)
  })

  it('rejects an item with no name', () => {
    expect(() => validateEstimate({ items: [{ ...good.items[0], name: '  ' }] }, 'm')).toThrow(
      /no name/,
    )
  })

  it('rejects a non-object reply', () => {
    expect(() => validateEstimate('sorry, I cannot help', 'm')).toThrow(EstimateError)
  })

  it('averages item confidence when the model omits an overall figure', () => {
    const result = validateEstimate(
      {
        items: [
          { ...good.items[0], confidence: 0.8 },
          { ...good.items[0], name: 'Rice', confidence: 0.4 },
        ],
      },
      'm',
    )
    expect(result.overallConfidence).toBeCloseTo(0.6)
  })

  it('keeps the raw reply for the audit trail', () => {
    expect(validateEstimate(good, 'm').raw).toBe(good)
  })
})

describe('the grams hint overrules the model', () => {
  it('rescales every number to the weight the user entered', () => {
    const result = applyGramsHint(validateEstimate(good, 'm'), 340) // double
    expect(result.items[0].amountG).toBeCloseTo(340)
    expect(result.items[0].proteinG).toBeCloseTo(106)
    expect(result.items[0].energyKcal).toBeCloseTo(562)
    expect(result.assumptions.join(' ')).toContain('340 g')
  })

  it('leaves the estimate alone when the model already agreed', () => {
    const base = validateEstimate(good, 'm')
    expect(applyGramsHint(base, 170)).toBe(base)
  })

  it('does nothing without a hint', () => {
    const base = validateEstimate(good, 'm')
    expect(applyGramsHint(base, undefined)).toBe(base)
  })
})

describe('atwater arithmetic', () => {
  it('computes calories from macros', () => {
    expect(kcalFromMacros(10, 20, 5)).toBe(165)
  })
})
