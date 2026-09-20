/**
 * Filling a day nobody logged, from the days they did.
 *
 * The case is ordinary: you were away, or busy, and three days later the week
 * view says you ate nothing. Zero is not what happened, and a week judged
 * against it is judged against a fiction — so the honest options are to leave
 * the gap visibly empty or to say plainly "this is roughly what you usually
 * eat". This is the second one, and everything here exists to keep the
 * "roughly" attached.
 *
 * Two rules, and both are enforced by the data rather than by a screen:
 *
 * 1. **A filled day never feeds the average it came from.** Otherwise a week
 *    of skipping slowly rewrites what "usually" means, each fill drawn from
 *    the last, until the baseline is made entirely of guesses about guesses.
 *    `isPatternFilled` is how every reader excludes them, and it reads the
 *    provenance rather than a flag somebody has to remember to set.
 *
 * 2. **A filled day never loses its tag.** It is `PATTERN_FILL` provenance,
 *    ranked below even an AI estimate, so anything actually observed for that
 *    day outranks it.
 */
import { mealSignature } from './usuals'
import type { Meal, MealSlot } from './nutrition'
import { dayKeyOf, type CalendarDate } from './time'

/** Was this record invented from a pattern rather than observed? */
export const isPatternFilled = (meal: Meal): boolean =>
  meal.provenance.source === 'PATTERN_FILL'

/** A day with nothing on it, which is not the same as a day of eating nothing. */
export interface DayGap {
  day: CalendarDate
  /** True once something real has been logged, so the offer can withdraw. */
  filled: boolean
}

/**
 * Where a typical day is drawn from.
 *
 * Two answers, because they disagree for good reasons. `RECENT` is the last
 * fortnight of whatever you ate, which follows a changing diet quickly.
 * `SAME_WEEKDAY` is the last several Mondays, which is better when the week
 * has a shape — a long run on Sundays, a canteen lunch on weekdays.
 */
export type FillSource = 'RECENT' | 'SAME_WEEKDAY'

export const FILL_WINDOW_DAYS = 14
/** How many same-weekday instances to look back over. */
export const SAME_WEEKDAY_WEEKS = 6

/**
 * Enough evidence to be worth offering at all.
 *
 * Below this the "average" is one or two days wearing a statistical hat, and
 * filling from it would dress a guess as a habit. The offer simply does not
 * appear — which is better than appearing and producing something silly.
 */
export const MIN_DAYS_FOR_FILL = 3

export interface TypicalMeal {
  slot: MealSlot
  /** The meal being copied — its items, amounts and numbers. */
  template: Meal
  /** How many of the considered days had a meal in this slot. */
  seenOn: number
}

export interface TypicalDay {
  source: FillSource
  /** Days with at least one real meal that the average was drawn from. */
  drawnFrom: number
  meals: TypicalMeal[]
}

/*
  The day a meal belongs to, as the record itself understands it.

  `dayKeyOf` rather than slicing the timestamp: a meal carries the zone it was
  logged in (D7), and a dinner at 23:30 in Jerusalem is not the previous day
  merely because UTC says so.
*/
const dayOf = (meal: Meal): CalendarDate => dayKeyOf(meal.time)

/**
 * What a typical day looks like, per meal slot.
 *
 * Not a mean of the numbers: averaging two breakfasts into 1.5 eggs and half a
 * banana produces a meal nobody ate and a list nobody recognises. It picks the
 * most frequent real meal in each slot instead, so what lands on the day is
 * something the person has actually eaten — which is also what makes
 * "correct it" a small edit rather than a rewrite.
 */
export function typicalDay(
  history: readonly Meal[],
  options: { source: FillSource; forDay: CalendarDate; today: CalendarDate },
): TypicalDay | undefined {
  const target = new Date(`${options.forDay}T00:00:00Z`)
  const earliest = new Date(`${options.today}T00:00:00Z`)
  earliest.setUTCDate(earliest.getUTCDate() - FILL_WINDOW_DAYS)

  const considered = history.filter((meal) => {
    if (meal.retracted) return false
    // Rule 1. A filled day is not evidence of anything.
    if (isPatternFilled(meal)) return false
    const day = dayOf(meal)
    if (day >= options.forDay) return false
    if (options.source === 'SAME_WEEKDAY') {
      const at = new Date(`${day}T00:00:00Z`)
      if (at.getUTCDay() !== target.getUTCDay()) return false
      const weeksBack = (target.getTime() - at.getTime()) / (7 * 86_400_000)
      return weeksBack > 0 && weeksBack <= SAME_WEEKDAY_WEEKS
    }
    return day >= earliest.toISOString().slice(0, 10)
  })

  const days = new Set(considered.map(dayOf))
  if (days.size < MIN_DAYS_FOR_FILL) return undefined

  const bySlot = new Map<MealSlot, Meal[]>()
  for (const meal of considered) {
    const group = bySlot.get(meal.slot)
    if (group) group.push(meal)
    else bySlot.set(meal.slot, [meal])
  }

  const meals: TypicalMeal[] = []
  for (const [slot, group] of bySlot) {
    /*
      The most frequent combination in this slot, and the most recent instance
      of it. Frequency decides WHAT; recency decides which copy, so the amounts
      and macros are the latest ones the person confirmed.
    */
    const counts = new Map<string, Meal[]>()
    for (const meal of group) {
      const signature = mealSignature(meal)
      if (!signature) continue
      const seen = counts.get(signature)
      if (seen) seen.push(meal)
      else counts.set(signature, [meal])
    }
    let best: Meal[] | undefined
    for (const instances of counts.values()) {
      if (!best || instances.length > best.length) best = instances
    }
    if (!best) continue
    const template = [...best].sort((a, b) => dayOf(b).localeCompare(dayOf(a)))[0]
    /*
      Offered only if the slot is usual, not merely present.

      Somebody who ate a late snack once in a fortnight does not have a
      "typical" snack, and inventing one every time they skip a day would
      quietly inflate every filled day above what they really eat.
    */
    const daysWithSlot = new Set(group.map(dayOf)).size
    if (daysWithSlot * 2 < days.size) continue
    meals.push({ slot, template, seenOn: daysWithSlot })
  }

  if (meals.length === 0) return undefined
  return { source: options.source, drawnFrom: days.size, meals }
}

/** Days in a range with nothing logged on them — the gaps worth offering to fill. */
export function findGaps(
  range: readonly CalendarDate[],
  meals: readonly Meal[],
  today: CalendarDate,
): DayGap[] {
  const withMeals = new Set(
    meals.filter((meal) => !meal.retracted && !isPatternFilled(meal)).map(dayOf),
  )
  const filled = new Set(
    meals.filter((meal) => !meal.retracted && isPatternFilled(meal)).map(dayOf),
  )
  return range
    // Today is not a gap; it is a day still in progress, and offering to fill
    // it would be inventing a dinner nobody has eaten yet.
    .filter((day) => day < today && !withMeals.has(day))
    .map((day) => ({ day, filled: filled.has(day) }))
}
