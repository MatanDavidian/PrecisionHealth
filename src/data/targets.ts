/**
 * Gathers what the daily targets are worked out from, and hands it to the rules.
 *
 * Four reads, whatever the store: the profile, the goals, the latest weight,
 * and the burn over the four weeks before the day. Everything that decides a
 * number lives in `src/domain/targets.ts`; this only fetches.
 */
import {
  addDays,
  ageOn,
  BURN_LOOKBACK_DAYS,
  convert,
  dailyTargets,
  dayKeyOf,
  goalFor,
  isActivityLevel,
  isObjective,
  toCanonical,
  type CalendarDate,
  type Observation,
  type TargetsInput,
  type TargetsResult,
  type UserId,
  type UserProfile,
} from '@/domain'
import { effectiveObservation } from './analytics'
import type { HealthRepositories } from './repositories'

export interface TargetsReading {
  result: TargetsResult
  /** The inputs as found, so Settings can show the working. */
  input: TargetsInput
  profile?: UserProfile
}

/**
 * One effective burn per day: the readings grouped by day, precedence applied
 * per day (D5). A watch's figure is a daily record; one typed on Today is an
 * instant on that day; both count, and on a day with both the usual
 * precedence decides.
 */
export function dailyBurns(readings: readonly Observation[]): number[] {
  const byDay = new Map<string, Observation[]>()
  for (const reading of readings) {
    const day = dayKeyOf(reading.time)
    const list = byDay.get(day) ?? []
    list.push(reading)
    byDay.set(day, list)
  }
  return [...byDay.values()]
    .map((candidates) => effectiveObservation(candidates))
    .filter((winner): winner is Observation => winner !== undefined)
    .map((winner) => convert(winner.value, 'kcal'))
}

export async function readDailyTargets(
  userId: UserId,
  day: CalendarDate,
  repos: HealthRepositories,
): Promise<TargetsReading> {
  const [profile, goals, weights, burns] = await Promise.all([
    repos.profiles.get(userId).catch(() => undefined),
    repos.goals.listActive(userId),
    repos.observations.latest(userId, 'WEIGHT'),
    // The days BEFORE the one shown: that day is never finished, and a half
    // day's burn would drag the average down every morning.
    repos.observations.listByRange(
      userId,
      { from: addDays(day, -BURN_LOOKBACK_DAYS), to: addDays(day, -1) },
      'TOTAL_ENERGY',
    ),
  ])

  const energyGoal = goalFor(goals, 'ENERGY')
  const weightGoal = goalFor(goals, 'WEIGHT')
  const proteinGoal = goalFor(goals, 'PROTEIN')
  const weight = effectiveObservation(weights)

  const input: TargetsInput = {
    objective: isObjective(energyGoal?.objective) ? energyGoal.objective : undefined,
    weightKg: weight ? convert(weight.value, 'kg') : undefined,
    targetKg: weightGoal ? convert(weightGoal.target, 'kg') : undefined,
    heightCm: profile?.height ? convert(toCanonical(profile.height), 'cm') : undefined,
    ageYears: profile?.birthYear ? ageOn(day, profile.birthYear) : undefined,
    sex: profile?.sex,
    activity: isActivityLevel(profile?.activity) ? profile.activity : undefined,
    burnHistory: dailyBurns(burns),
    proteinGoalG: proteinGoal ? convert(proteinGoal.target, 'g') : undefined,
  }
  return { result: dailyTargets(input), input, profile }
}
