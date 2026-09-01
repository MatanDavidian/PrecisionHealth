import { describe, expect, it } from 'vitest'
import { applyLeftover, eatenShare, leftoverChangesAnything } from '../leftovers'

const food = (amountG: number, energyKcal: number) => ({
  amountG,
  energyKcal,
  proteinG: amountG / 10,
  carbsG: amountG / 5,
  fatG: amountG / 20,
})

describe('what came back on the plate', () => {
  const plate = [food(200, 400), food(100, 300)]

  it('scales each food by its own fraction, not the meal by an average', () => {
    const after = applyLeftover(plate, {
      portions: [
        { index: 0, eatenFraction: 1 },
        { index: 1, eatenFraction: 0.5 },
      ],
    })
    expect(after[0]).toMatchObject({ amountG: 200, energyKcal: 400 })
    expect(after[1]).toMatchObject({ amountG: 50, energyKcal: 150 })
  })

  it('carries the macros with the weight, like any other re-portioning', () => {
    const [only] = applyLeftover([food(200, 400)], { portions: [{ index: 0, eatenFraction: 0.25 }] })
    expect(only).toMatchObject({ amountG: 50, energyKcal: 100, proteinG: 5, carbsG: 10, fatG: 2.5 })
  })

  it('leaves a food the estimate never mentions completely alone', () => {
    // Assuming "eaten" costs an unrecorded leftover. Assuming "left" would make
    // food you did eat vanish with nothing to notice it by.
    const after = applyLeftover(plate, { portions: [{ index: 1, eatenFraction: 0 }] })
    expect(after[0]).toEqual(plate[0])
  })

  it('keeps a wholly uneaten food as a visible zero rather than deleting it', () => {
    const after = applyLeftover(plate, { portions: [{ index: 1, eatenFraction: 0 }] })
    expect(after).toHaveLength(2)
    expect(after[1]).toMatchObject({ amountG: 0, energyKcal: 0 })
  })

  it('refuses nonsense from the model instead of passing it on', () => {
    const wild = applyLeftover([food(200, 400)], {
      portions: [{ index: 0, eatenFraction: 3 }],
    })
    expect(wild[0].amountG, 'a fraction above 1 must not invent food').toBe(200)

    const negative = applyLeftover([food(200, 400)], {
      portions: [{ index: 0, eatenFraction: -2 }],
    })
    expect(negative[0].amountG, 'a negative fraction must not go below zero').toBe(0)

    const nonsense = applyLeftover([food(200, 400)], {
      portions: [{ index: 0, eatenFraction: Number.NaN }],
    })
    expect(nonsense[0].amountG, 'NaN must fall back to fully eaten').toBe(200)
  })

  it('ignores an index that is not on the plate', () => {
    const after = applyLeftover(plate, { portions: [{ index: 9, eatenFraction: 0 }] })
    expect(after).toEqual(plate)
  })
})

describe('how much of the meal was eaten', () => {
  it('weights by calories, not by weight', () => {
    // Leaving half the 300 kcal item is a bigger deal than leaving half the
    // lettuce, and the headline figure has to say so.
    const plate = [food(200, 400), food(100, 300)]
    const after = applyLeftover(plate, {
      portions: [
        { index: 0, eatenFraction: 1 },
        { index: 1, eatenFraction: 0.5 },
      ],
    })
    // 400 + 150 of 700.
    expect(eatenShare(plate, after)).toBeCloseTo(0.7857, 3)
  })

  it('says everything was eaten when there was nothing to eat', () => {
    expect(eatenShare([], [])).toBe(1)
    expect(eatenShare([food(0, 0)], [food(0, 0)])).toBe(1)
  })

  it('knows when an estimate would change nothing', () => {
    const plate = [food(200, 400)]
    expect(leftoverChangesAnything(plate, { portions: [{ index: 0, eatenFraction: 1 }] })).toBe(false)
    expect(leftoverChangesAnything(plate, { portions: [{ index: 0, eatenFraction: 0.9 }] })).toBe(true)
    expect(leftoverChangesAnything(plate, { portions: [{ index: 4, eatenFraction: 0 }] })).toBe(false)
  })
})
