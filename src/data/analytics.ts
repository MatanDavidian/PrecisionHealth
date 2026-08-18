/**
 * Derived values. Kept separate from stored records on purpose: the roadmap
 * requires that computed numbers never overwrite or masquerade as measurements.
 */
import { quantity, type Meal, type Nutrients } from '@/domain'

export const emptyNutrients = (): Nutrients => ({
  energy: quantity(0, 'kcal'),
  protein: quantity(0, 'g'),
  carbs: quantity(0, 'g'),
  fat: quantity(0, 'g'),
})

/** Sum a day's meals into totals. Assumes canonical units (kcal, g). */
export const totalNutrients = (meals: Meal[]): Nutrients =>
  meals
    .flatMap((meal) => meal.items)
    .reduce<Nutrients>((total, item) => {
      total.energy.value += item.nutrients.energy.value
      total.protein.value += item.nutrients.protein.value
      total.carbs.value += item.nutrients.carbs.value
      total.fat.value += item.nutrients.fat.value
      return total
    }, emptyNutrients())

/** True when any value feeding this total is an unconfirmed AI estimate. */
export const hasUnconfirmedEstimate = (meals: Meal[]): boolean =>
  meals
    .flatMap((meal) => meal.items)
    .some((item) => item.provenance.source === 'AI_ESTIMATE' && item.provenance.kind !== 'USER_CONFIRMED')
