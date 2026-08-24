/**
 * Reading what you usually eat.
 *
 * A window rather than all of history: habits change, and a breakfast you ate
 * daily last spring should stop being the first suggestion this autumn.
 */
import {
  findUsualFoods,
  findUsualMeals,
  latestVersions,
  addDays,
  dayKey,
  type MealSlot,
  type Meal,
  type UsualFood,
  type UsualMeal,
  type UserId,
} from '@/domain'
import { getRepositories } from '.'
import { deviceZone } from './newRecords'

/** How far back to look for habits. Long enough to see a pattern, short enough to forget one. */
export const USUALS_WINDOW_DAYS = 60

export interface Usuals {
  /** Yesterday's meals as they were eaten, for repeating the whole day. */
  yesterdayMeals: Meal[]
  /** Meals usually eaten at the slot being logged now. */
  forThisSlot: UsualMeal[]
  /** Everything repeatable, whatever the slot — for "see all". */
  all: UsualMeal[]
  /** Single foods, which combine into a snack. */
  foods: UsualFood[]
  /** Yesterday's meals, for repeating a whole day. */
  yesterday: UsualMeal[]
}

export async function readUsuals(userId: UserId, slot: MealSlot): Promise<Usuals> {
  const zone = deviceZone()
  const today = dayKey(new Date().toISOString(), zone)
  const from = addDays(today, -USUALS_WINDOW_DAYS)

  const history = latestVersions(
    await getRepositories().meals.listByRange(userId, { from, to: today }),
  )

  const yesterdayKey = addDays(today, -1)
  const yesterdayMeals = history.filter((meal) => {
    const at = meal.time.kind === 'instant' ? meal.time.at : undefined
    return at ? dayKey(at, zone) === yesterdayKey : false
  })

  return {
    yesterdayMeals,
    forThisSlot: findUsualMeals(history, { slot, limit: 3 }),
    all: findUsualMeals(history, { limit: 20 }),
    foods: findUsualFoods(history, { limit: 8 }),
    yesterday: findUsualMeals(yesterdayMeals, { limit: 5 }),
  }
}
