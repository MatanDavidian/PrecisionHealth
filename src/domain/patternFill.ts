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
 *    day outranks it — and `countedMeals` is where outranking happens in the
 *    totals, not only in a ranking table.
 */
import { liveItems } from './corrections'
import type { FoodItem, Meal } from './nutrition'
import { convert } from './units'
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

/**
 * What an ordinary day adds up to — the numbers only.
 *
 * Not meals. A filled day is a statement about how much, not about what: the
 * person did not log that Tuesday, and inventing a lunch for it would put a
 * dish on the record that may never have been eaten. A total is the honest
 * size of the claim.
 */
export interface TypicalIntake {
  source: FillSource
  /** Days with at least one real meal that the average was drawn from. */
  drawnFrom: number
  energyKcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

/*
  The day a meal belongs to, as the record itself understands it.

  `dayKeyOf` rather than slicing the timestamp: a meal carries the zone it was
  logged in (D7), and a dinner at 23:30 in Jerusalem is not the previous day
  merely because UTC says so.
*/
const dayOf = (meal: Meal): CalendarDate => dayKeyOf(meal.time)

const sumOf = (meal: Meal, pick: (item: FoodItem) => number): number =>
  liveItems(meal.items).reduce((total, item) => total + pick(item), 0)

/**
 * The average logged day: each day's total, then the mean of those totals.
 *
 * Per day first, because the question is "how much does this person eat in a
 * day", and a mean over meals would answer a different one — a day with a
 * snack has more meals, not a smaller lunch.
 *
 * An earlier version picked the most frequent meal in each slot instead. On a
 * varied fortnight averaging 1,920 kcal it filled 1,200: the plain meals are
 * the ones that repeat, so they won every slot, and a snack eaten on fewer
 * than half the days was dropped altogether. It was consistently low, under a
 * button that said "average".
 */
export function typicalIntake(
  history: readonly Meal[],
  options: { source: FillSource; forDay: CalendarDate; today: CalendarDate },
): TypicalIntake | undefined {
  const target = new Date(`${options.forDay}T00:00:00Z`)
  const earliest = new Date(`${options.today}T00:00:00Z`)
  earliest.setUTCDate(earliest.getUTCDate() - FILL_WINDOW_DAYS)
  const from = earliest.toISOString().slice(0, 10)

  const byDay = new Map<CalendarDate, Meal[]>()
  for (const meal of history) {
    if (meal.retracted) continue
    // Rule 1. A filled day is not evidence of anything.
    if (isPatternFilled(meal)) continue
    const day = dayOf(meal)
    if (day >= options.forDay) continue
    if (options.source === 'SAME_WEEKDAY') {
      const at = new Date(`${day}T00:00:00Z`)
      if (at.getUTCDay() !== target.getUTCDay()) continue
      const weeksBack = (target.getTime() - at.getTime()) / (7 * 86_400_000)
      if (weeksBack <= 0 || weeksBack > SAME_WEEKDAY_WEEKS) continue
    } else if (day < from) {
      continue
    }
    const group = byDay.get(day)
    if (group) group.push(meal)
    else byDay.set(day, [meal])
  }

  if (byDay.size < MIN_DAYS_FOR_FILL) return undefined

  const days = [...byDay.values()]
  const mean = (pick: (item: FoodItem) => number) =>
    days.reduce((total, meals) => total + meals.reduce((s, m) => s + sumOf(m, pick), 0), 0) /
    days.length

  return {
    source: options.source,
    drawnFrom: days.length,
    energyKcal: mean((item) => convert(item.nutrients.energy, 'kcal')),
    proteinG: mean((item) => convert(item.nutrients.protein, 'g')),
    carbsG: mean((item) => convert(item.nutrients.carbs, 'g')),
    fatG: mean((item) => convert(item.nutrients.fat, 'g')),
  }
}

/**
 * The meals that count towards a day, once anything real has been logged on it.
 *
 * Rule 2 said an observed record outranks a filled one; this is where that is
 * true in the arithmetic rather than only in a ranking table. Without it,
 * filling Tuesday and then logging Tuesday's dinner adds a whole estimated day
 * ON TOP of the dinner — the fill was standing in for the day, and the day has
 * now turned up.
 *
 * Read-time rather than deleting the estimate on the next write: nothing has
 * to remember to clean up, and if that dinner is deleted again the day falls
 * back to its estimate instead of back to zero.
 */
export function countedMeals<T extends Meal>(meals: readonly T[]): T[] {
  const observedDays = new Set(
    meals.filter((meal) => !meal.retracted && !isPatternFilled(meal)).map(dayOf),
  )
  return meals.filter((meal) => !isPatternFilled(meal) || !observedDays.has(dayOf(meal)))
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
