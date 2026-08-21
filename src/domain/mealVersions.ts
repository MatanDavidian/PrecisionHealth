/**
 * Meal versioning (D15).
 *
 * The rules, in one place, so client and future server cannot drift:
 *
 *  - reading  — the highest version of each meal wins
 *  - editing  — never mutate; append the same meal at version + 1
 *  - conflict — two records at the SAME version are two devices that edited
 *               the same base; the user settles it and their answer is
 *               written as the next version
 *
 * This is the aggregate-level echo of what `resolveEffective` does for single
 * facts (D5/D6): same philosophy, applied to something with children.
 */
import type { IdFactory } from './corrections'
import type { Meal, MealId } from './nutrition'

/** Records of one meal, newest version first. */
const byMeal = (meals: readonly Meal[]): Map<MealId, Meal[]> => {
  const groups = new Map<MealId, Meal[]>()
  for (const meal of meals) {
    const group = groups.get(meal.id)
    if (group) group.push(meal)
    else groups.set(meal.id, [meal])
  }
  for (const group of groups.values()) group.sort((a, b) => b.version - a.version)
  return groups
}

/**
 * What to display: the newest version of each meal.
 *
 * When several records tie at the top version the meal is in conflict; this
 * returns one of them so the day still renders, and `detectMealConflicts`
 * reports the disagreement alongside it. Showing something and flagging it
 * beats showing nothing.
 */
export function latestVersions(meals: readonly Meal[]): Meal[] {
  return [...byMeal(meals).values()].map((group) => group[0])
}

export interface MealConflict {
  mealId: MealId
  version: number
  /** The competing records at that version, in the order they were found. */
  candidates: Meal[]
}

/** Two devices, one base version, different edits. */
export function detectMealConflicts(meals: readonly Meal[]): MealConflict[] {
  const conflicts: MealConflict[] = []

  for (const [mealId, group] of byMeal(meals)) {
    const top = group[0].version
    const atTop = group.filter((meal) => meal.version === top)
    // Distinct records only: the same record seen twice (synced from two
    // places) is not a disagreement.
    const distinct = [...new Map(atTop.map((meal) => [meal.recordId, meal])).values()]
    if (distinct.length > 1) conflicts.push({ mealId, version: top, candidates: distinct })
  }

  return conflicts
}

/**
 * The next version of a meal, carrying `changes`.
 *
 * The only way to edit a meal. Returns a new record — the input is untouched
 * and stays in history.
 */
export function nextVersion(
  meal: Meal,
  changes: Partial<Omit<Meal, 'id' | 'recordId' | 'version' | 'userId'>>,
  newId: IdFactory,
): Meal {
  return { ...meal, ...changes, recordId: newId(), version: meal.version + 1 }
}

/**
 * The user picked a winner among conflicting records.
 *
 * Their choice is written as the next version, which outranks every candidate
 * — so the conflict resolves by the ordinary read rule, with no record deleted
 * and the losing edit still in history.
 */
export function resolveMealConflict(
  chosen: Meal,
  conflict: MealConflict,
  newId: IdFactory,
): Meal {
  return { ...chosen, recordId: newId(), version: conflict.version + 1 }
}
