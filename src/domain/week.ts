/**
 * A stretch of days, eaten against burned.
 *
 * The arithmetic lives in the domain rather than the chart because it is the
 * part with opinions in it: which day counts as which, what an absent figure
 * means, and how a week is graded. A bar chart should only decide how tall to
 * draw a rectangle.
 */
import { addDays, type CalendarDate } from './time'
import { balanceOf, verdictFor, weekAimKcal, weekGapKcal, type EnergyBalance, type Objective, type Verdict } from './objectives'

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
  /** How many days actually carry a burned figure, for honest averaging. */
  daysWithBurn: number
  aimKcal: number | null
  gapKcal: number
  verdict: Verdict
}

/** The seven days ending on `to`, oldest first — the week as a person reads it. */
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
  const eaten = days.reduce((sum, d) => sum + d.eatenKcal, 0)
  const burned = days.reduce((sum, d) => sum + (d.burnedKcal ?? 0), 0)
  const daysWithBurn = days.filter((d) => d.burnedKcal !== undefined).length

  const balance = balanceOf(eaten, burned)
  // No burn anywhere means there is nothing to weigh the eating against.
  const aimKcal = objective && daysWithBurn > 0 ? weekAimKcal(objective, daysWithBurn) : null

  return {
    days,
    from: days[0]?.day ?? '',
    to: days.at(-1)?.day ?? '',
    balance,
    daysWithBurn,
    aimKcal,
    gapKcal: weekGapKcal(balance.netKcal, aimKcal),
    verdict: verdictFor(balance.netKcal, aimKcal),
  }
}

/** The tallest bar in the chart, so both series share one scale. */
export const peakOf = (days: DayEnergy[]): number =>
  Math.max(1, ...days.flatMap((d) => [d.eatenKcal, d.burnedKcal ?? 0]))
