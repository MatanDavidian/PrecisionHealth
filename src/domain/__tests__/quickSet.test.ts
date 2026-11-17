import { describe, expect, it } from 'vitest'
import { QUICK_SET_MAX_KCAL, quickSetIntake, type DayIntake } from '..'

/** The average a person's logged days add up to, as `typicalIntake` returns it. */
const usual: DayIntake = { energyKcal: 1920, proteinG: 96, carbsG: 215, fatG: 68 }

describe('quick-set: how a day compared with usual', () => {
  it('average is the average, untouched', () => {
    expect(quickSetIntake('AVERAGE', usual)).toEqual(usual)
  })

  it('less and more are 15% either side, macros with them', () => {
    expect(quickSetIntake('LESS', usual)).toEqual({ energyKcal: 1632, proteinG: 82, carbsG: 183, fatG: 58 })
    expect(quickSetIntake('MORE', usual)).toEqual({ energyKcal: 2208, proteinG: 110, carbsG: 247, fatG: 78 })
  })

  it('a number keeps the usual mix of protein, carbs and fat', () => {
    expect(quickSetIntake('NUMBER', usual, 1800)).toEqual({ energyKcal: 1800, proteinG: 90, carbsG: 202, fatG: 64 })
  })

  it('without an average there is nothing to be less or more than', () => {
    expect(quickSetIntake('LESS', undefined)).toBeUndefined()
    expect(quickSetIntake('AVERAGE', undefined)).toBeUndefined()
    expect(quickSetIntake('MORE', undefined)).toBeUndefined()
  })

  it('a number without an average is calories only: no invented macros', () => {
    expect(quickSetIntake('NUMBER', undefined, 1750)).toEqual({ energyKcal: 1750, proteinG: 0, carbsG: 0, fatG: 0 })
  })

  it('refuses a number that is no day at all', () => {
    for (const kcal of [undefined, 0, -200, Number.NaN, QUICK_SET_MAX_KCAL + 1]) {
      expect(quickSetIntake('NUMBER', usual, kcal), String(kcal)).toBeUndefined()
    }
    expect(quickSetIntake('NUMBER', usual, QUICK_SET_MAX_KCAL)?.energyKcal).toBe(QUICK_SET_MAX_KCAL)
  })

  it('rounds to whole calories and grams', () => {
    expect(quickSetIntake('NUMBER', undefined, 1799.6)?.energyKcal).toBe(1800)
  })
})
