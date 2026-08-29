/**
 * What gets sent to the model when someone asks about their week.
 *
 * A named, explicit shape rather than "whatever the screen had", because this
 * is the one place the app hands a person's eating to somebody else's computer.
 * Being able to read the payload in one file is what makes the promise on the
 * button — "nothing is sent until you ask" — checkable rather than merely
 * stated.
 *
 * What is deliberately NOT here: identity of any kind. No name, no email, no
 * user id, no dates of birth. The model is asked about seven days of food and
 * arithmetic; it has no business knowing whose.
 */
import type { CalendarDate } from './time'
import type { Objective } from './objectives'

export interface ReportedMeal {
  slot: string
  /** Item names as logged. The most useful thing in the whole payload. */
  foods: string[]
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export interface ReportedDay {
  day: CalendarDate
  /** Which weekday, so the model can see a weekend pattern without a calendar. */
  weekday: string
  meals: ReportedMeal[]
  eatenKcal: number
  burnedKcal?: number
}

export interface WeekReport {
  from: CalendarDate
  to: CalendarDate
  days: ReportedDay[]
  totals: {
    eatenKcal: number
    burnedKcal: number
    netKcal: number
    daysWithBurn: number
    proteinG: number
  }
  goal: {
    objective?: Objective
    /** The week's aim in kcal, already scaled to the days that reported. */
    aimKcal: number | null
    gapKcal: number
    verdict: string
  }
  body?: {
    weightKg?: number
    targetKg?: number
  }
}

/** Rough size of the payload, for the "here is what will be sent" line. */
export const reportMealCount = (report: WeekReport): number =>
  report.days.reduce((sum, day) => sum + day.meals.length, 0)
