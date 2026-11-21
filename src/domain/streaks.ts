/**
 * Days on target, and how many in a row (docs/features/daily-targets.md).
 *
 * A day counts when it was logged and its calories landed within 10% of the
 * day's target. Wider than the card's 5% "on target", on purpose: a streak is
 * about the habit across days, and a rule that a 150 kcal snack could break
 * would teach people to stop logging the snack.
 *
 * Symmetric, like the card: calories are aimed at, so far under is a miss as
 * much as far over. A day nobody logged is a miss too, and so is a day filled
 * in from the average, which is an estimate standing in for logging rather
 * than logging.
 */
import { addDays, type CalendarDate } from './time'

export const STREAK_SHARE = 0.1

/** How far back a streak is looked for. A longer one reads "60 days", which is plenty to be proud of. */
export const STREAK_LOOKBACK_DAYS = 60

export type DayOutcome = 'HIT' | 'OVER' | 'UNDER' | 'NOT_LOGGED'

export function dayOutcome(targetKcal: number, eatenKcal: number, logged: boolean): DayOutcome {
  if (!logged) return 'NOT_LOGGED'
  const gap = eatenKcal - targetKcal
  if (Math.abs(gap) <= targetKcal * STREAK_SHARE) return 'HIT'
  return gap > 0 ? 'OVER' : 'UNDER'
}

export interface DayRecord {
  day: CalendarDate
  /** Undefined when the day has no targets to be measured against. */
  outcome?: DayOutcome
  proteinReached?: boolean
}

export interface Streak {
  /** Days in a row on target. */
  days: number
  /** Whether today is one of them. Until it is, today is still in progress and breaks nothing. */
  throughToday: boolean
}

/**
 * The run of days on target that ends today or yesterday.
 *
 * Today counts once it is on target, and does not break the run while it is
 * not: at breakfast nobody has missed today yet.
 */
export function streakOf(records: readonly DayRecord[], today: CalendarDate): Streak {
  const byDay = new Map(records.map((record) => [record.day, record]))
  const throughToday = byDay.get(today)?.outcome === 'HIT'
  let days = throughToday ? 1 : 0
  let cursor = addDays(today, -1)
  while (byDay.get(cursor)?.outcome === 'HIT') {
    days += 1
    cursor = addDays(cursor, -1)
  }
  return { days, throughToday }
}

export interface TargetsSummary {
  /** Days that had targets and have happened, today included. */
  counted: number
  hit: number
  proteinReached: number
}

/** A stretch of days at a glance: how many hit the calories, and how many reached the protein. */
export function summariseTargets(records: readonly DayRecord[]): TargetsSummary {
  const counted = records.filter((record) => record.outcome !== undefined)
  return {
    counted: counted.length,
    hit: counted.filter((record) => record.outcome === 'HIT').length,
    proteinReached: counted.filter((record) => record.proteinReached).length,
  }
}
