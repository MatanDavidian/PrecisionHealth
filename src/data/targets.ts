/**
 * Gathers what the daily targets are worked out from, and hands it to the rules.
 *
 * Everything that decides a number lives in `src/domain/targets.ts` and
 * `src/domain/streaks.ts`; this only fetches. One day is four reads; a
 * stretch of days (for the week and the streak) is five, whatever its length:
 * the profile, the goals, the latest weight, and the burn and the meals as
 * two range reads.
 */
import {
  addDays,
  ageOn,
  chosenObjectives,
  BURN_LOOKBACK_DAYS,
  convert,
  countedMeals,
  dailyTargets,
  dayKeyOf,
  dayOutcome,
  goalFor,
  isActivityLevel,
  isObjective,
  isPatternFilled,
  latestVersions,
  liveItems,
  ownGoal,
  toCanonical,
  type CalendarDate,
  type DailyTargets,
  type DayOutcome,
  type Goal,
  type Observation,
  type TargetsInput,
  type TargetsResult,
  type UserId,
  type UserProfile,
} from '@/domain'
import { effectiveObservation, totalNutrients } from './analytics'
import type { HealthRepositories } from './repositories'

export interface TargetsReading {
  result: TargetsResult
  /** The inputs as found, so Settings can show the working. */
  input: TargetsInput
  profile?: UserProfile
}

/**
 * One effective burn per day, keyed by day: the readings grouped by day,
 * precedence applied per day (D5). A watch's figure is a daily record; one
 * typed on Today is an instant on that day; both count, and on a day with
 * both the usual precedence decides.
 */
export function burnsByDay(readings: readonly Observation[]): Map<CalendarDate, number> {
  const grouped = new Map<CalendarDate, Observation[]>()
  for (const reading of readings) {
    const day = dayKeyOf(reading.time)
    grouped.set(day, [...(grouped.get(day) ?? []), reading])
  }
  const burns = new Map<CalendarDate, number>()
  for (const [day, candidates] of grouped) {
    const winner = effectiveObservation(candidates)
    if (winner) burns.set(day, convert(winner.value, 'kcal'))
  }
  return burns
}

/** The day totals as a list, for a single day's targets. */
export const dailyBurns = (readings: readonly Observation[]): number[] => [...burnsByDay(readings).values()]

/** What the targets need that does not change from day to day. */
interface Basis {
  profile?: UserProfile
  goals: Goal[]
  weights: Observation[]
}

/** One day's inputs: the shared basis, with that day's age and that day's four weeks of burn. */
function inputFor(day: CalendarDate, basis: Basis, burns: Map<CalendarDate, number>): TargetsInput {
  const { profile, goals } = basis
  const energyGoal = goalFor(goals, 'ENERGY')
  const weightGoal = goalFor(goals, 'WEIGHT')
  const weight = effectiveObservation(basis.weights)
  const history: number[] = []
  // The days BEFORE this one: a day is never finished while it is shown, and a
  // half day's burn would drag the average down every morning.
  for (let back = 1; back <= BURN_LOOKBACK_DAYS; back += 1) {
    const kcal = burns.get(addDays(day, -back))
    if (kcal !== undefined) history.push(kcal)
  }
  const ownProtein = ownGoal(goals, 'PROTEIN')
  const ownEnergy = ownGoal(goals, 'ENERGY_INTAKE')
  return {
    objective: isObjective(energyGoal?.objective) ? energyGoal.objective : undefined,
    objectives: chosenObjectives(energyGoal),
    weightKg: weight ? convert(weight.value, 'kg') : undefined,
    targetKg: weightGoal ? convert(weightGoal.target, 'kg') : undefined,
    heightCm: profile?.height ? convert(toCanonical(profile.height), 'cm') : undefined,
    ageYears: profile?.birthYear ? ageOn(day, profile.birthYear) : undefined,
    sex: profile?.sex,
    activity: isActivityLevel(profile?.activity) ? profile.activity : undefined,
    burnHistory: history,
    proteinGoalG: ownProtein ? convert(ownProtein.target, 'g') : undefined,
    energyGoalKcal: ownEnergy ? convert(ownEnergy.target, 'kcal') : undefined,
  }
}

async function readBasis(userId: UserId, repos: HealthRepositories): Promise<Basis> {
  const [profile, goals, weights] = await Promise.all([
    repos.profiles.get(userId).catch(() => undefined),
    repos.goals.listActive(userId),
    repos.observations.latest(userId, 'WEIGHT'),
  ])
  return { profile, goals, weights }
}

const readBurns = async (userId: UserId, from: CalendarDate, to: CalendarDate, repos: HealthRepositories) =>
  burnsByDay(
    await repos.observations.listByRange(
      userId,
      { from: addDays(from, -BURN_LOOKBACK_DAYS), to: addDays(to, -1) },
      'TOTAL_ENERGY',
    ),
  )

export async function readDailyTargets(
  userId: UserId,
  day: CalendarDate,
  repos: HealthRepositories,
): Promise<TargetsReading> {
  const [basis, burns] = await Promise.all([readBasis(userId, repos), readBurns(userId, day, day, repos)])
  const input = inputFor(day, basis, burns)
  return { result: dailyTargets(input), input, profile: basis.profile }
}

export interface DayAgainstTargets {
  day: CalendarDate
  targets?: DailyTargets
  eaten: { energyKcal: number; proteinG: number; carbsG: number; fatG: number }
  /** Whether anyone logged a meal: a day filled from the average is not logging. */
  logged: boolean
  /** Undefined when the day had no targets to be measured against. */
  outcome?: DayOutcome
  proteinReached?: boolean
}

/**
 * Every day from `from` to `to`, each against its own targets.
 *
 * Each day's burn average is that day's four weeks, so a day keeps the target
 * it had; the goal, the weight and the profile are as they are now (see the
 * spec's "Past days").
 */
export async function readTargetsHistory(
  userId: UserId,
  from: CalendarDate,
  to: CalendarDate,
  repos: HealthRepositories,
): Promise<DayAgainstTargets[]> {
  const [basis, burns, meals] = await Promise.all([
    readBasis(userId, repos),
    readBurns(userId, from, to, repos),
    repos.meals.listByRange(userId, { from, to }),
  ])

  // The same counting as the day's own totals: newest versions, an estimate
  // standing in for a day only until a real meal replaces it, superseded
  // foods dropped.
  const live = countedMeals(latestVersions(meals)).map((meal) => ({ ...meal, items: liveItems(meal.items) }))
  const byDay = new Map<CalendarDate, typeof live>()
  for (const meal of live) {
    const day = dayKeyOf(meal.time)
    byDay.set(day, [...(byDay.get(day) ?? []), meal])
  }

  const days: DayAgainstTargets[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const onDay = byDay.get(day) ?? []
    const totals = totalNutrients(onDay)
    const eaten = {
      energyKcal: convert(totals.energy, 'kcal'),
      proteinG: convert(totals.protein, 'g'),
      carbsG: convert(totals.carbs, 'g'),
      fatG: convert(totals.fat, 'g'),
    }
    const logged = onDay.some((meal) => !isPatternFilled(meal))
    const result = dailyTargets(inputFor(day, basis, burns))
    const targets = result.ok ? result.targets : undefined
    days.push({
      day,
      targets,
      eaten,
      logged,
      outcome: targets ? dayOutcome(targets.energyKcal, eaten.energyKcal, logged) : undefined,
      proteinReached: targets ? logged && eaten.proteinG >= targets.proteinG : undefined,
    })
  }
  return days
}
