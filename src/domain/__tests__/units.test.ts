import { describe, expect, it } from 'vitest'
import { canonical, convert, toCanonical } from '../units'

describe('canonical units', () => {
  it('stores mass in grams whatever was entered', () => {
    expect(canonical(72.8, 'kg').value).toBe(72800)
    expect(canonical(170, 'g').value).toBe(170)
    expect(Math.round(canonical(1, 'lb').value)).toBe(454)
  })

  it('stores duration in seconds', () => {
    expect(canonical(62, 'min').value).toBe(3720)
    expect(canonical(1, 'h').value).toBe(3600)
  })

  it('round-trips a value back to the unit a human wants', () => {
    const stored = canonical(72.8, 'kg')
    expect(convert(stored, 'kg')).toBeCloseTo(72.8, 6)
    expect(convert(stored, 'g')).toBe(72800)
  })

  it('refuses to convert across dimensions', () => {
    expect(() => convert(canonical(70, 'kg'), 'cm')).toThrow(/different dimensions/)
  })

  it('normalises energy to kcal', () => {
    expect(toCanonical({ value: 4.184, unit: 'kJ' }).value).toBeCloseTo(1, 6)
  })
})
