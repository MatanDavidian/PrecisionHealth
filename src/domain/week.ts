/**
 * A stretch of days, eaten against burned.
 *
 * The arithmetic lives in the domain rather than the chart because it is the
 * part with opinions in it: which day counts as which, what an absent figure
 * means, and how a week is graded. A bar chart should only decide how tall to
 * draw a rectangle.
 */
import { addDays, type CalendarDate } from './time'
import {
  balanceOf,
  driftOf,
  verdictFor,
  weekAimKcal,
  weekGapKcal,
  type Drift,
  type EnergyBalance,
  type Objective,
  type Verdict,
} from './objectives'

export interface DayEnergy {
  day: CalendarDate
  /** Total logged from meals. Zero is a real answer: you logged nothing. */
  eatenKcal: number
  /**
   * What was burned, or undefined when nothing was recorded.
   *
   * Undefined and zero must not be confused. A day with no figure is a day we
   * know nothing about, and averaging it in as zero would drag a week's burn
   * down and turn a missing measurement into a claim about the body.
   */
  burnedKcal?: number
}

export interface WeekEnergy {
  days: DayEnergy[]
  from: CalendarDate
  to: CalendarDate
  balance: EnergyBalance
  /** How many days carry BOTH figures — what `balance` is computed over. */
  daysWithBurn: number
  /**
   * Everything eaten across the whole week, including days with no burn.
   *
   * Separate from `balance.eatenKcal`, which counts only comparable days. Both
   * are true and they answer different questions: "what did I eat this week"
   * and "what did I eat on the days I can weigh".
   */
  eatenAllDays: number
  /** Days with any food logged, so an average is over days that happened. */
  daysWithFood: number
  aimKcal: number | null
  gapKcal: number
  verdict: Verdict
  /** Said only when there is no target and the imbalance is large. */
  drift: Drift
}

/**
 * Which day a week starts on. Sunday, as Israel reads a calendar.
 *
 * A constant rather than a setting: nobody has a second locale to serve yet,
 * and a preference nobody has asked for is a branch to maintain and a screen to
 * explain. It is named so the day it does become one, there is a single place
 * to change.
 */
export const WEEK_STARTS_ON = 0 // Sunday, matching Date#getDay()

/**
 * The calendar week containing `day` — Sunday to Saturday, oldest first.
 *
 * Calendar weeks rather than the seven days ending today, and the reason is
 * insights rather than tidiness. A rolling window cannot own one: generated on
 * a Wednesday it describes Thu–Wed, and by Thursday that same "this week" means
 * a different set of days, so a saved insight would quietly stop matching what
 * is on screen. A calendar week is a stable, nameable thing, which is what
 * makes saving possible at all.
 *
 * It is also what makes navigation meaningful. "The previous week" has an
 * obvious size; the previous rolling window does not.
 */
export function weekContaining(day: CalendarDate): CalendarDate[] {
  // Midday, so the arithmetic cannot be pushed onto a neighbouring date by an
  // hour of daylight saving.
  const at = new Date(`${day}T12:00:00Z`)
  const shift = (at.getUTCDay() - WEEK_STARTS_ON + 7) % 7
  const start = addDays(day, -shift)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** The Sunday a week is filed under — its identity, and the key an insight uses. */
export const weekStartOf = (day: CalendarDate): CalendarDate => weekContaining(day)[0]

/** Shift by whole weeks, for the navigation. */
export const addWeeks = (day: CalendarDate, weeks: number): CalendarDate =>
  addDays(weekStartOf(day), weeks * 7)

/** The seven days ending on `to`, oldest first. Kept for callers that want a rolling view. */
export const weekEndingOn = (to: CalendarDate, length = 7): CalendarDate[] =>
  Array.from({ length }, (_, i) => addDays(to, -(length - 1 - i)))

/**
 * Rolls a week up.
 *
 * The total burn counts only the days that reported one, and the aim is scaled
 * to those same days. Comparing a full week's target against four days of data
 * would manufacture a deficit out of nothing but absence.
 */
export function summariseWeek(
  days: DayEnergy[],
  objective?: Objective,
): WeekEnergy {
  /*
    The net compares only days that carry BOTH figures.

    Summing all the eating against only the days that reported a burn is not a
    comparison, it is a bias — and a large one. A watch sends completed days,
    so today never has a burn figure, and every week would have counted one
    extra day of food against nothing. On a real week that turned a deficit of
    about 1,400 into a surplus of 976: not merely imprecise, the wrong sign.

    So a day with no burn contributes neither side. Its food is still shown on
    the chart and still counted in the "eaten" total, because it was eaten —
    but it cannot be part of a balance it only has one half of.
  */
  const comparable = days.filter((d) => d.burnedKcal !== undefined)
  const eaten = comparable.reduce((sum, d) => sum + d.eatenKcal, 0)
  const burned = comparable.reduce((sum, d) => sum + (d.burnedKcal ?? 0), 0)
  const daysWithBurn = comparable.length

  /** Everything logged, including days the watch has not reported on yet. */
  const eatenAllDays = days.reduce((sum, d) => sum + d.eatenKcal, 0)
  /** How many days have any food at all, for an honest average. */
  const daysWithFood = days.filter((d) => d.eatenKcal > 0).length

  const balance = balanceOf(eaten, burned)
  // No burn anywhere means there is nothing to weigh the eating against.
  const aimKcal = objective && daysWithBurn > 0 ? weekAimKcal(objective, daysWithBurn) : null

  return {
    days,
    from: days[0]?.day ?? '',
    to: days.at(-1)?.day ?? '',
    balance,
    eatenAllDays,
    daysWithFood,
    daysWithBurn,
    aimKcal,
    gapKcal: weekGapKcal(balance.netKcal, aimKcal),
    verdict: verdictFor(balance.netKcal, aimKcal),
    drift: daysWithBurn > 0 ? driftOf(balance.netKcal, aimKcal) : undefined,
  }
}

/** The tallest bar in the chart, so both series share one scale. */
export const peakOf = (days: DayEnergy[]): number =>
  Math.max(1, ...days.flatMap((d) => [d.eatenKcal, d.burnedKcal ?? 0]))
