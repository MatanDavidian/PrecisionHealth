/**
 * What the person said about a day's log (meal-suggestions-precision.md §4.6).
 *
 * Two kinds of answer, both small and both append-only (D4), like every
 * other record:
 *
 * - **The day's log is complete, or is not.** "I logged everything" makes a
 *   day count with full confidence; "I didn't log everything" takes it out
 *   of the suggestion card's balance (intake and budget both). A later
 *   answer replaces an earlier one; `UNSET` takes an answer back.
 * - **A usual meal was skipped**, answered when the card asked "No lunch
 *   logged today. Did you eat it?". It stops the question coming back that
 *   day.
 *
 * Only the suggestion card's arithmetic reads these. The week view shows
 * every day as it was logged, whatever was answered.
 */
import type { CalendarDate, Instant } from './time'
import type { UserId } from './user'
import type { MealSlot } from './nutrition'

export type DayCompleteness = 'COMPLETE' | 'INCOMPLETE' | 'UNSET'

export interface DayCheck {
  id: string
  userId: UserId
  day: CalendarDate
  recordedAt: Instant
  /** The day's log is complete, or is not, or the answer was taken back. */
  completeness?: DayCompleteness
  /** A usual meal the person said they skipped that day. */
  skipped?: MealSlot
}

export interface DayAnswers {
  completeness?: 'COMPLETE' | 'INCOMPLETE'
  skipped: MealSlot[]
}

/**
 * Each day's answers, from its checks: the latest completeness wins, and
 * skipped meals add up.
 */
export function dayAnswers(checks: readonly DayCheck[]): Map<CalendarDate, DayAnswers> {
  const byDay = new Map<CalendarDate, DayAnswers & { at?: Instant }>()
  const sorted = [...checks].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  for (const check of sorted) {
    const day = byDay.get(check.day) ?? { skipped: [] }
    if (check.completeness) {
      day.completeness = check.completeness === 'UNSET' ? undefined : check.completeness
    }
    if (check.skipped && !day.skipped.includes(check.skipped)) day.skipped.push(check.skipped)
    byDay.set(check.day, day)
  }
  return new Map([...byDay].map(([day, { completeness, skipped }]) => [day, { completeness, skipped }]))
}
