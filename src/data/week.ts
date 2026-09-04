/**
 * Reading a week of energy in and energy out.
 *
 * One range query for meals and one per day for the burned figure, because
 * observations index by day and there is no range read on the port. Seven small
 * reads beats widening the interface for one screen.
 *
 * The repositories are passed in rather than taken from the composition root.
 * Importing that root pulls the app's own database connection open as a side
 * effect, which made these functions impossible to test against a throwaway
 * store — and a reader that cannot be tested is a reader nobody can trust.
 */
import {
  convert,
  dayKeyOf,
  latestVersions,
  liveItems,
  summariseWeek,
  weekContaining,
  type CalendarDate,
  type DayEnergy,
  type Objective,
  type ReportedDay,
  type ReportedMeal,
  type UserId,
  type WeekEnergy,
  type WeekReport,
} from '@/domain'
import type { HealthRepositories } from './repositories'
import { effectiveObservation } from './analytics'

const mealKcal = (items: { nutrients: { energy: Parameters<typeof convert>[0] } }[]): number =>
  items.reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0)

export async function readWeek(
  userId: UserId,
  anyDayIn: CalendarDate,
  objective: Objective | undefined,
  repos: HealthRepositories,
): Promise<WeekEnergy> {
  // The calendar week the day belongs to, not the seven days ending on it, so
  // that navigating to a date and switching to the week shows the week that
  // date is IN — and so an insight has a stable set of days to be about.
  const days = weekContaining(anyDayIn)

  const [meals, ...burnSets] = await Promise.all([
    repos.meals.listByRange(userId, { from: days[0], to: days.at(-1)! }),
    ...days.map((day) => repos.observations.listByDay(userId, day, 'TOTAL_ENERGY')),
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

/**
 * The same seven days, with the meals kept — for the insights request.
 *
 * Separate from `readWeek` because the chart does not need meal names and this
 * does. Fetching them for every week view to serve a button most people will
 * not press would be paying for the feature regardless.
 */
export async function readWeekReport(
  userId: UserId,
  anyDayIn: CalendarDate,
  objective: Objective | undefined,
  body: { weightKg?: number; targetKg?: number } | undefined,
  repos: HealthRepositories,
): Promise<WeekReport> {
  // The same week the view is showing, so an insight is about what is on
  // screen rather than about a rolling window that has since moved.
  const days = weekContaining(anyDayIn)

  const [meals, ...burnSets] = await Promise.all([
    repos.meals.listByRange(userId, { from: days[0], to: days.at(-1)! }),
    ...days.map((day) => repos.observations.listByDay(userId, day, 'TOTAL_ENERGY')),
  ])

  const live = latestVersions(meals).map((meal) => {
    const items = liveItems(meal.items)
    return {
      day: dayKeyOf(meal.time),
      meal: {
        slot: meal.slot,
        foods: items.map((i) => i.name),
        kcal: Math.round(mealKcal(items)),
        proteinG: Math.round(items.reduce((s, i) => s + convert(i.nutrients.protein, 'g'), 0)),
        carbsG: Math.round(items.reduce((s, i) => s + convert(i.nutrients.carbs, 'g'), 0)),
        fatG: Math.round(items.reduce((s, i) => s + convert(i.nutrients.fat, 'g'), 0)),
      } satisfies ReportedMeal,
    }
  })

  const energy: DayEnergy[] = days.map((day, i) => {
    const burn = effectiveObservation(burnSets[i])
    return {
      day,
      eatenKcal: live.filter((m) => m.day === day).reduce((sum, m) => sum + m.meal.kcal, 0),
      burnedKcal: burn ? convert(burn.value, 'kcal') : undefined,
    }
  })
  const week = summariseWeek(energy, objective)

  const reported: ReportedDay[] = days.map((day, i) => ({
    day,
    // The weekday by name, so a weekend pattern is visible without the model
    // having to do calendar arithmetic on an ISO date.
    weekday: new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    }),
    meals: live.filter((m) => m.day === day).map((m) => m.meal),
    eatenKcal: Math.round(energy[i].eatenKcal),
    burnedKcal:
      energy[i].burnedKcal === undefined ? undefined : Math.round(energy[i].burnedKcal!),
  }))

  return {
    from: days[0],
    to: days.at(-1)!,
    days: reported,
    totals: {
      /*
        Three figures over ONE span, and the span is named.

        `eatenKcal` and `burnedKcal` cover only the days carrying both — which
        is what makes `netKcal` a comparison rather than a bias. But `days`
        below lists all seven, and a reader given both and told neither
        naturally divides the total by seven. The model did exactly that and
        reported a daily average roughly half the truth, in prose, confidently.

        So the span travels with the numbers, and everything eaten is carried
        separately under a name that says so.
      */
      comparedDays: week.daysWithBurn,
      eatenKcal: Math.round(week.balance.eatenKcal),
      burnedKcal: Math.round(week.balance.burnedKcal),
      netKcal: Math.round(week.balance.netKcal),
      eatenAllDaysKcal: Math.round(week.eatenAllDays),
      daysWithFood: week.daysWithFood,
      daysWithBurn: week.daysWithBurn,
      proteinG: reported.reduce(
        (sum, d) => sum + d.meals.reduce((s, m) => s + m.proteinG, 0),
        0,
      ),
    },
    goal: {
      objective,
      aimKcal: week.aimKcal,
      gapKcal: Math.round(week.gapKcal),
      verdict: week.verdict,
    },
    // Rounded, and only when set. A target nobody chose is not context.
    body:
      body?.weightKg === undefined && body?.targetKg === undefined
        ? undefined
        : {
            weightKg: body?.weightKg === undefined ? undefined : Math.round(body.weightKg * 10) / 10,
            targetKg: body?.targetKg === undefined ? undefined : Math.round(body.targetKg * 10) / 10,
          },
  }
}
