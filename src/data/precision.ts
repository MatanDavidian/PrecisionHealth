/**
 * The readings behind Phases 3–5 of the precision design
 * (docs/features/meal-suggestions-precision.md §5.2–5.4).
 *
 * The rules are pure, in `domain/suggestions.ts` and `domain/burnCalibration.ts`;
 * this only reads: today's active calories against the usual from the same
 * source, the usual bedtime from the watch's sleep, and the 28 days the
 * weight trend is read over.
 */
import {
  addDays,
  burnCalibration,
  convert,
  dayAnswers,
  dayKey,
  dayKeyOf,
  POSSIBLY_INCOMPLETE_SHARE,
  trainingCredit,
  usualBedtime,
  CALIBRATION_DAYS,
  type ActiveReading,
  type Calibration,
  type CalendarDate,
  type DailyTargets,
  type Observation,
  type TrainingCredit,
  type UserId,
} from '@/domain'
import { getRepositories } from '.'
import { effectiveObservation } from './analytics'
import { deviceZone } from './newRecords'
import { readTargetsHistory } from './targets'
import type { HealthRepositories } from './repositories'

/** How far back the usual day's activity is read: the same four weeks the usual burn uses. */
const ACTIVE_LOOKBACK_DAYS = 28
/** How many nights the usual bedtime is read from. */
const BEDTIME_NIGHTS = 14

/** One effective reading a day, with its source: precedence as everywhere else (D5). */
function perDay(readings: readonly Observation[]): ActiveReading[] {
  const grouped = new Map<CalendarDate, Observation[]>()
  for (const reading of readings) {
    const day = dayKeyOf(reading.time)
    grouped.set(day, [...(grouped.get(day) ?? []), reading])
  }
  const days: ActiveReading[] = []
  for (const [day, candidates] of grouped) {
    const winner = effectiveObservation(candidates)
    if (winner) days.push({ day, kcal: convert(winner.value, 'kcal'), source: winner.provenance.source })
  }
  return days
}

/** Today's training credit (§5.2): today's active calories against the usual, from the same source. */
export async function readTrainingCredit(
  userId: UserId,
  targets: DailyTargets,
  now: Date = new Date(),
): Promise<TrainingCredit | undefined> {
  const today = dayKey(now.toISOString(), deviceZone())
  const readings = perDay(
    await getRepositories().observations.listByRange(
      userId,
      { from: addDays(today, -ACTIVE_LOOKBACK_DAYS), to: today },
      'ACTIVE_ENERGY',
    ),
  )
  return trainingCredit({
    today: readings.find((r) => r.day === today),
    history: readings.filter((r) => r.day !== today),
    ownTarget: targets.energy.from === 'GOAL',
  })
}

/** The usual bedtime (§5.3), "HH:MM", from the last two weeks of nights; undefined with too few. */
export async function readUsualBedtime(userId: UserId, now: Date = new Date()): Promise<string | undefined> {
  const zone = deviceZone()
  const today = dayKey(now.toISOString(), zone)
  const repos = getRepositories()
  const nights = (
    await Promise.all(
      Array.from({ length: BEDTIME_NIGHTS }, (_, i) => repos.sleep.forDay(userId, addDays(today, -i)).catch(() => [])),
    )
  ).flat()
  const starts = nights.flatMap((night) => {
    const at = night.time.kind === 'interval' ? night.time.start : night.time.kind === 'instant' ? night.time.at : undefined
    if (!at) return []
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'zone' in night.time && night.time.zone ? night.time.zone : zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(at))
    return [local]
  })
  return usualBedtime(starts)
}

/**
 * The weight trend against the burn in use (§5.4), over the 28 days before
 * today: each day's intake, whether it was logged fully enough to count, the
 * usual burn its targets used, and the weigh-ins.
 */
export async function readCalibration(
  userId: UserId,
  now: Date = new Date(),
  repos: HealthRepositories = getRepositories(),
): Promise<Calibration> {
  const today = dayKey(now.toISOString(), deviceZone())
  const from = addDays(today, -CALIBRATION_DAYS)
  const to = addDays(today, -1)
  const [history, checks, weights] = await Promise.all([
    readTargetsHistory(userId, from, to, repos),
    repos.dayChecks.listByRange(userId, { from, to }).catch(() => []),
    repos.observations.listByRange(userId, { from, to }, 'WEIGHT'),
  ])
  const answers = dayAnswers(checks)
  const weighIns = [...new Map(weights.map((w) => [dayKeyOf(w.time), w])).keys()].flatMap((day) => {
    const winner = effectiveObservation(weights.filter((w) => dayKeyOf(w.time) === day))
    return winner ? [{ day, kg: convert(winner.value, 'kg') }] : []
  })
  return burnCalibration(
    history.map((day) => {
      const answer = answers.get(day.day)?.completeness
      const target = day.targets?.energyKcal
      // Counted when really logged: a person logged it (not set in one tap), it
      // is not marked incomplete, and it is not under half its target unanswered.
      const complete =
        day.logged &&
        answer !== 'INCOMPLETE' &&
        (answer === 'COMPLETE' || target === undefined || day.eaten.energyKcal >= target * POSSIBLY_INCOMPLETE_SHARE)
      return { day: day.day, eatenKcal: day.eaten.energyKcal, complete, usedBurnKcal: day.targets?.burn?.kcal }
    }),
    weighIns,
  )
}

