/**
 * Reading a week of energy in and energy out.
 *
 * One range query for meals and one per day for the burned figure, because
 * observations index by day and there is no range read on the port. Seven small
 * reads beats widening the interface for one screen.
 */
import {
  convert,
  dayKeyOf,
  latestVersions,
  liveItems,
  summariseWeek,
  weekEndingOn,
  type CalendarDate,
  type DayEnergy,
  type Objective,
  type UserId,
  type WeekEnergy,
} from '@/domain'
import { getRepositories } from '.'
import { effectiveObservation } from './analytics'

const mealKcal = (items: { nutrients: { energy: Parameters<typeof convert>[0] } }[]): number =>
  items.reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0)

export async function readWeek(
  userId: UserId,
  endingOn: CalendarDate,
  objective?: Objective,
): Promise<WeekEnergy> {
  const days = weekEndingOn(endingOn)
  const repos = getRepositories()

  const [meals, ...burnSets] = await Promise.all([
    repos.meals.listByRange(userId, { from: days[0], to: days.at(-1)! }),
    ...days.map((day) => repos.observations.listByDay(userId, day, 'ACTIVE_ENERGY')),
  ])

  // The store returns every version; take the newest of each meal and drop
  // items a correction superseded, or a confirmed estimate counts twice.
  const live = latestVersions(meals).map((meal) => ({
    day: dayKeyOf(meal.time),
    kcal: mealKcal(liveItems(meal.items)),
  }))

  const rows: DayEnergy[] = days.map((day, i) => {
    const burn = effectiveObservation(burnSets[i])
    return {
      day,
      eatenKcal: live.filter((m) => m.day === day).reduce((sum, m) => sum + m.kcal, 0),
      // Left undefined rather than zeroed when nothing was recorded — a day we
      // know nothing about is not a day of no expenditure.
      burnedKcal: burn ? convert(burn.value, 'kcal') : undefined,
    }
  })

  return summariseWeek(rows, objective)
}
