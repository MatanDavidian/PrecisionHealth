/**
 * Derived values.
 *
 * DECISION: derived numbers live here and are never written back onto the
 * records they came from. A daily protein total is a view of the meals, not a
 * fact about the day — recomputing it after a correction must be free.
 */
import {
  canonical,
  CONFLICT_TOLERANCE,
  detectConflict,
  needsConfirmation,
  resolveEffective,
  type CanonicalQuantity,
  type Conflict,
  type Goal,
  type Meal,
  type Nutrients,
  type Observation,
} from '@/domain'

export const emptyNutrients = (): Nutrients => ({
  energy: canonical(0, 'kcal'),
  protein: canonical(0, 'g'),
  carbs: canonical(0, 'g'),
  fat: canonical(0, 'g'),
})

const add = (a: CanonicalQuantity, b: CanonicalQuantity): CanonicalQuantity =>
  ({ ...a, value: a.value + b.value })

/** Sum a day's meals. Safe because every value is already in canonical units. */
export const totalNutrients = (meals: Meal[]): Nutrients =>
  meals
    .flatMap((meal) => meal.items)
    .reduce<Nutrients>(
      (total, item) => ({
        energy: add(total.energy, item.nutrients.energy),
        protein: add(total.protein, item.nutrients.protein),
        carbs: add(total.carbs, item.nutrients.carbs),
        fat: add(total.fat, item.nutrients.fat),
      }),
      emptyNutrients(),
    )

/** Food the AI guessed at and nobody has confirmed. */
export const unconfirmedItems = (meals: Meal[]) =>
  meals.flatMap((meal) => meal.items).filter((item) => needsConfirmation(item.provenance))

/** The value to display for a metric, once precedence has been applied. */
export const effectiveObservation = (candidates: Observation[]): Observation | undefined =>
  resolveEffective(candidates)

/** A disagreement worth putting in front of the user. */
export const observationConflict = (candidates: Observation[]): Conflict<Observation> | undefined => {
  const code = candidates[0]?.code
  const tolerance = code ? CONFLICT_TOLERANCE[code] : undefined
  if (tolerance === undefined) return undefined
  return detectConflict(candidates, (o) => o.value.value, tolerance)
}

export type GoalProgress = {
  goal: Goal
  actual: number
  attained: boolean
}

/** Deterministic goal evaluation — arithmetic, never a model's opinion. */
export const evaluateGoal = (goal: Goal, actual: number): GoalProgress => ({
  goal,
  actual,
  attained:
    goal.direction === 'AT_LEAST'
      ? actual >= goal.target.value
      : goal.direction === 'AT_MOST'
        ? actual <= goal.target.value
        : Math.abs(actual - goal.target.value) < 0.001,
})
