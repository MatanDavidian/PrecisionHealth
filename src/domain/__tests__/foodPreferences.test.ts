import { describe, expect, it } from 'vitest'
import { cleanFoodPreferences, MAX_AVOID_CHARS } from '../user'

describe('food preferences, as kept', () => {
  it('keeps known ways of eating, in their order, and the words trimmed', () => {
    expect(cleanFoodPreferences({ diets: ['NO_PORK', 'VEGETARIAN', 'KETO'], avoid: '  peanuts (allergy) ' })).toEqual({
      diets: ['VEGETARIAN', 'NO_PORK'],
      avoid: 'peanuts (allergy)',
    })
  })

  it('bounds the words', () => {
    expect(cleanFoodPreferences({ diets: [], avoid: 'x'.repeat(500) })?.avoid).toHaveLength(MAX_AVOID_CHARS)
  })

  it('is nothing when nothing is set, or the value is not one', () => {
    expect(cleanFoodPreferences({ diets: [], avoid: '  ' })).toBeUndefined()
    expect(cleanFoodPreferences(undefined)).toBeUndefined()
    expect(cleanFoodPreferences('vegan')).toBeUndefined()
  })
})
