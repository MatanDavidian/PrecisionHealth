/**
 * What to eat now, from what you usually eat (docs/features/meal-suggestions.md).
 *
 * Pure: the request the model is sent, the gate that decides whether to offer
 * it at all, and how well an answer fits the day. The data layer gathers the
 * meals; the AI adapters send the request; nothing here reads or writes.
 *
 * The request is a named type for the same reason the week's report is: the
 * card promises "nothing that says who you are", and a promise like that is
 * only worth making if it can be checked by reading one file. No ids, no
 * dates, no names of people: food, numbers, and the time of day.
 */
import { liveItems } from './corrections'
import { isPatternFilled } from './patternFill'
import type { GoalChoice } from './goalChoice'
import type { Meal, MealSlot } from './nutrition'
import type { Objective } from './objectives'
import type { FoodPreferences } from './user'
import { dayProgress, type DailyTargets, type DayProgress } from './targets'
import type { CalendarDate } from './time'
import { findUsualFoods, findUsualMeals } from './usuals'

/** At least this much left, in calories or protein, before suggesting anything. */
export const SUGGEST_MIN_KCAL = 100
export const SUGGEST_MIN_PROTEIN_G = 10

/** How much of a person's history goes into one request. */
export const MAX_USUAL_MEALS = 8
export const MAX_USUAL_FOODS = 25
export const MAX_TODAY_FOODS = 20
export const MAX_NOTE_CHARS = 200
/** The most suggestions shown, and the most that may be "new ideas". */
export const MAX_SUGGESTIONS = 3

export interface Macros {
  energyKcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export interface SuggestionRequest {
  /** The meal it is for, and the local time: "an evening snack", not a lunch. */
  slot: MealSlot
  localTime: string
  /** What is left of today's targets. Carbs and fat never below zero. */
  left: Macros
  /** The goal, as the two answers and what they come to. */
  goal: { aim?: GoalChoice['aim']; focus: GoalChoice['focus']; objective?: Objective }
  /** Foods already eaten today, by name, so they are not offered again. */
  eatenToday: string[]
  /** Meals logged often, with their usual foods and amounts. */
  usualMeals: {
    name: string
    foods: { name: string; grams: number }[]
    kcal: number
    proteinG: number
    carbsG: number
    fatG: number
    timesLogged: number
    usualSlot: MealSlot
  }[]
  /** Single foods logged often, with their usual amount and numbers per 100 g. */
  usualFoods: {
    name: string
    usualG: number
    per100g: { kcal: number; proteinG: number; carbsG: number; fatG: number }
    timesLogged: number
  }[]
  /** The person's words for this time: "quick", "no cooking". */
  note?: string
  /** Titles offered a moment ago, when asking again. */
  avoid?: string[]
  /**
   * FILL: today has room. PROTEIN: today's calories are used (or over) but
   * protein is short and the week has room, so only lean protein.
   */
  mode: 'FILL' | 'PROTEIN'
  /** The most calories one suggestion may have. Enforced again on the reply. */
  maxKcal: number
  /** The last seven days against their targets: negative is under (protein: behind). */
  week?: {
    days: number
    balanceKcal: number
    proteinG: number
    fatG: number
    carbsG: number
    measuredDays: number
    /** Where the balance stands: within ± the range is on plan. */
    rangeKcal: number
    status: PlanStatus
  }
  /** Usual meals not eaten yet today, whose room the suggestion leaves. */
  stillToCome?: { slot: MealSlot; usualKcal: number; usualTime: string }[]
  /** Training today: what, how long, and the active calories so far. */
  trainingToday?: { workouts: { kind: string; minutes: number }[]; activeKcal?: number }
  /** Rules the suggestions must follow: ways of eating, and foods to avoid. */
  preferences?: FoodPreferences
  /** Protein one sitting uses well, for this person: the aim and the most (§5.3). */
  proteinPerSittingG?: { aim: number; max: number }
  /** What carbs should do, by today's training (§5.3). */
  carbFocus?: CarbFocus
  /** The recent days averaged under the fat floor: some fat is welcome (§5.3). */
  fatLow?: boolean
  /** Minutes to the usual bedtime, when within three hours: light, slow protein (§5.3). */
  minutesToBedtime?: number
}

export type SuggestionSource = 'USUAL' | 'FOODS' | 'NEW'

export interface SuggestedFood extends Macros {
  name: string
  amountG: number
}

export interface MealSuggestion {
  title: string
  source: SuggestionSource
  why: string
  foods: SuggestedFood[]
  /** Added up from the foods, never taken from the model's own sum. */
  totals: Macros
}

/** What the model answered, validated. */
export interface MealSuggestions {
  suggestions: MealSuggestion[]
  /** A sentence when there is something to say about the gap itself ("fine to leave"). */
  note?: string
  raw: unknown
  model: string
}

const one = (value: number) => Math.round(value * 10) / 10

/** The most a protein snack may add when today's calories are used: a snack, not a meal. */
export const PROTEIN_SNACK_MAX_KCAL = 250
/** "Hungry? Suggest a light protein snack": optional, and never more than this. */
export const LIGHT_SNACK_MAX_KCAL = 120
/**
 * A day's recorded burn below this share of the usual one is taken as a watch
 * that stopped counting (a flat battery, left on the charger), not as a day of
 * lying still: the day is weighed against its target instead.
 */
export const PLAUSIBLE_BURN_SHARE = 0.6
/** An earlier day with less than this share of its target logged may be incomplete. */
export const POSSIBLY_INCOMPLETE_SHARE = 0.5
/** Fewer counted days than this, today among them, and the period is not used: today alone decides. */
export const MIN_COUNTED_DAYS = 3
/** The plan range: ± the larger of these. */
export const PLAN_RANGE_MIN_KCAL = 150
export const PLAN_RANGE_SHARE = 0.03

/** One day of the period, as the balance needs it. */
export interface WeekDayInput {
  day: CalendarDate
  eaten: Macros
  targets?: Pick<DailyTargets, 'energyKcal' | 'proteinG' | 'carbsG' | 'fatG' | 'balanceKcal' | 'energy'>
  /** What the day really burned, if a watch or the person recorded it. */
  burnedKcal?: number
  /** Set in one tap (quick-set): an estimate by design, never "possibly incomplete". */
  setInOneTap?: boolean
  /** What the person answered about the day's log. */
  completeness?: 'COMPLETE' | 'INCOMPLETE'
}

/** Why a day of the period was left out of the balance. */
export type ExcludedReason =
  /** Nothing logged: a day not logged, not a day of eating nothing. */
  | 'EMPTY'
  /** The person said they did not log everything. */
  | 'INCOMPLETE'
  /** Under half its target and not answered yet: out until the person says. */
  | 'UNANSWERED'
  /** No targets to weigh it against. */
  | 'NO_TARGETS'

export interface WeekSoFar {
  /** The period: its first day and today. */
  from: CalendarDate
  to: CalendarDate
  /** Days in the period, and how many of them counted (today among them). */
  periodDays: number
  days: number
  /** Eaten minus budget over the counted days: negative is below plan. */
  balanceKcal: number
  /** The counted days' budget: the base of the plan range. */
  budgetKcal: number
  /** The same for each macro, against each day's own targets: negative is under (protein: behind). */
  proteinG: number
  fatG: number
  carbsG: number
  /** Of the counted days before today, how many used a recorded burn. */
  measuredDays: number
  /** Fat eaten over the counted days, in grams: for the fat floor (§5.3). */
  fatEatenG: number
  /** Days left out, and why; those UNANSWERED are the ones the card asks about. */
  excluded: { day: CalendarDate; reason: ExcludedReason; eatenKcal: number; targetKcal?: number }[]
  /** Fewer than 3 counted days: the period is not used, and today alone decides. */
  sparse: boolean
  /**
   * The counted days before today, for "Why two numbers?": eaten, what they
   * burned (recorded, or the usual), the deficit (or surplus) the goal
   * planned, and so their budget.
   */
  before?: {
    from: CalendarDate
    to: CalendarDate
    days: number
    eatenKcal: number
    expenditureKcal: number
    plannedKcal: number
    budgetKcal: number
  }
  today: { day: CalendarDate; eatenKcal: number; targetKcal?: number }
}

/**
 * A day's budget: what it burned plus the goal's balance, when the burn was
 * recorded and believable; otherwise its target. A target the person typed
 * in is their number and stays it.
 */
function budgetOf(day: WeekDayInput): { kcal: number; measured: boolean } | undefined {
  const targets = day.targets
  if (!targets) return undefined
  if (day.burnedKcal !== undefined && targets.energy.from === 'RULE') {
    const usual = targets.energyKcal - targets.balanceKcal
    if (day.burnedKcal >= usual * PLAUSIBLE_BURN_SHARE) {
      return { kcal: day.burnedKcal + targets.balanceKcal, measured: true }
    }
  }
  return { kcal: targets.energyKcal, measured: false }
}

/**
 * The period so far, its first day to today: eaten against budget, day by
 * day, and each macro against each day's own targets.
 *
 * Days before today count what they really burned where it was recorded
 * (a watch, or a number typed on Today), so a long run on Tuesday leaves room
 * that the same day's average target would not show. Today is weighed against
 * its target, because today's burn is not finished.
 *
 * Left out, both their intake and their budget: a day with nothing on it; a
 * day the person said was not fully logged; and a day under half its target
 * that nobody has answered for yet (it might be a forgotten dinner, and a
 * forgotten dinner must not buy a snack days later). The week view still
 * shows them all; only this balance leaves them out.
 */
export function weekSoFar(before: readonly WeekDayInput[], today: WeekDayInput): WeekSoFar {
  const sum = { kcal: 0, budget: 0, protein: 0, fat: 0, carbs: 0, fatEaten: 0 }
  const earlier = { days: 0, eaten: 0, expenditure: 0, planned: 0, budget: 0, from: '', to: '' }
  const excluded: WeekSoFar['excluded'] = []
  let days = 0
  let measuredDays = 0
  const add = (day: WeekDayInput, budgetKcal: number) => {
    const targets = day.targets!
    sum.kcal += day.eaten.energyKcal - budgetKcal
    sum.budget += budgetKcal
    sum.protein += day.eaten.proteinG - targets.proteinG
    sum.fat += day.eaten.fatG - targets.fatG
    sum.fatEaten += day.eaten.fatG
    sum.carbs += day.eaten.carbsG - targets.carbsG
    days += 1
  }
  for (const day of before) {
    const leaveOut = (reason: ExcludedReason) =>
      excluded.push({ day: day.day, reason, eatenKcal: Math.round(day.eaten.energyKcal), targetKcal: day.targets?.energyKcal })
    if (day.eaten.energyKcal <= 0) {
      leaveOut('EMPTY')
      continue
    }
    const budget = budgetOf(day)
    if (!budget || !day.targets) {
      leaveOut('NO_TARGETS')
      continue
    }
    if (day.completeness === 'INCOMPLETE') {
      leaveOut('INCOMPLETE')
      continue
    }
    const low = day.eaten.energyKcal < day.targets.energyKcal * POSSIBLY_INCOMPLETE_SHARE
    if (low && !day.setInOneTap && day.completeness !== 'COMPLETE') {
      leaveOut('UNANSWERED')
      continue
    }
    add(day, budget.kcal)
    if (budget.measured) measuredDays += 1
    earlier.days += 1
    earlier.eaten += day.eaten.energyKcal
    earlier.budget += budget.kcal
    earlier.planned += -day.targets.balanceKcal
    earlier.expenditure += budget.kcal - day.targets.balanceKcal
    if (!earlier.from) earlier.from = day.day
    earlier.to = day.day
  }
  if (today.targets) add(today, today.targets.energyKcal)
  const first = before.length > 0 ? before[0].day : today.day
  return {
    from: first,
    to: today.day,
    periodDays: before.length + 1,
    days,
    balanceKcal: Math.round(sum.kcal),
    budgetKcal: Math.round(sum.budget),
    proteinG: Math.round(sum.protein),
    fatG: Math.round(sum.fat),
    carbsG: Math.round(sum.carbs),
    measuredDays,
    fatEatenG: Math.round(sum.fatEaten),
    excluded,
    sparse: days < MIN_COUNTED_DAYS,
    ...(earlier.days > 0
      ? {
          before: {
            from: earlier.from,
            to: earlier.to,
            days: earlier.days,
            eatenKcal: Math.round(earlier.eaten),
            expenditureKcal: Math.round(earlier.expenditure),
            plannedKcal: Math.round(earlier.planned),
            budgetKcal: Math.round(earlier.budget),
          },
        }
      : {}),
    today: { day: today.day, eatenKcal: Math.round(today.eaten.energyKcal), targetKcal: today.targets?.energyKcal },
  }
}

export type PlanStatus = 'BELOW' | 'WITHIN' | 'ABOVE'

/**
 * Where a balance stands against its plan: within ± max(150 kcal, 3% of the
 * budget) is within plan range. A decision never flips on a difference
 * smaller than the noise in what was logged and burned.
 */
export function planRange(balanceKcal: number, budgetKcal: number): { rangeKcal: number; status: PlanStatus } {
  const rangeKcal = Math.round(Math.max(PLAN_RANGE_MIN_KCAL, budgetKcal * PLAN_RANGE_SHARE))
  const status: PlanStatus = balanceKcal < -rangeKcal ? 'BELOW' : balanceKcal > rangeKcal ? 'ABOVE' : 'WITHIN'
  return { rangeKcal, status }
}

/** A usual meal not eaten yet today, whose room a suggestion now should leave. */
export interface MealToCome {
  slot: MealSlot
  /** Its usual calories: the median of the days it was eaten. */
  usualKcal: number
  /** Its usual time, "HH:MM". */
  usualTime: string
}

/** The meals whose room is kept, and whose absence is asked about: the main ones. */
const MAIN_SLOTS: readonly MealSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER']
/** A meal is usual when it was eaten on at least half the logged days, and on 4 or more. */
const USUAL_SHARE = 0.5
const USUAL_MIN_DAYS = 4
/** Within this much of its usual time, a meal is now, not to come. */
const TO_COME_MARGIN_MIN = 45
/** This long after its usual time, a usual meal not logged is probably missing. */
const MISSING_AFTER_MIN = 90

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const hhmmOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`

/** One past meal, as the usual-meal rules read it: its day, slot, local time and calories. */
export type PastMeal = { day: string; slot: MealSlot; time: string; kcal: number }

/** The main meals eaten on most logged days, with their usual time and calories. */
function usualMainMeals(history: readonly PastMeal[]): { slot: MealSlot; minutes: number; kcal: number }[] {
  const loggedDays = new Set(history.map((meal) => meal.day)).size
  if (loggedDays === 0) return []
  const usual: { slot: MealSlot; minutes: number; kcal: number }[] = []
  for (const slot of MAIN_SLOTS) {
    // One figure per day: two lunches on a day are one lunch, as eaten.
    const byDay = new Map<string, { kcal: number; minutes: number[] }>()
    for (const meal of history.filter((m) => m.slot === slot)) {
      const day = byDay.get(meal.day) ?? { kcal: 0, minutes: [] }
      day.kcal += meal.kcal
      day.minutes.push(minutesOf(meal.time))
      byDay.set(meal.day, day)
    }
    if (byDay.size < USUAL_MIN_DAYS || byDay.size < loggedDays * USUAL_SHARE) continue
    usual.push({
      slot,
      minutes: median([...byDay.values()].map((day) => Math.min(...day.minutes))),
      kcal: Math.round(median([...byDay.values()].map((day) => day.kcal))),
    })
  }
  return usual
}

/**
 * The usual meals still to come today (meal-suggestions.md).
 *
 * From the history before today: a main meal eaten on most logged days, at
 * a usual time still more than 45 minutes away, and not logged yet today.
 * At 16:30, with dinner usually at 20:00 and about 650 kcal, a suggestion
 * now should leave those 650 free.
 */
export function mealsToCome(history: readonly PastMeal[], todaysSlots: readonly MealSlot[], nowTime: string): MealToCome[] {
  const now = minutesOf(nowTime)
  return usualMainMeals(history)
    .filter((meal) => !todaysSlots.includes(meal.slot) && meal.minutes > now + TO_COME_MARGIN_MIN)
    .map((meal) => ({ slot: meal.slot, usualKcal: meal.kcal, usualTime: hhmmOf(meal.minutes) }))
}

/**
 * The usual meals that look missing today: eaten on most logged days, an
 * hour and a half past their usual time, not logged today, and not said to
 * be skipped. Asked about before suggesting, because a forgotten lunch would
 * make every suggestion too generous.
 */
export function missingMeals(
  history: readonly PastMeal[],
  todaysSlots: readonly MealSlot[],
  nowTime: string,
  skipped: readonly MealSlot[] = [],
): MealToCome[] {
  const now = minutesOf(nowTime)
  return usualMainMeals(history)
    .filter(
      (meal) =>
        !todaysSlots.includes(meal.slot) && !skipped.includes(meal.slot) && meal.minutes + MISSING_AFTER_MIN < now,
    )
    .map((meal) => ({ slot: meal.slot, usualKcal: meal.kcal, usualTime: hhmmOf(meal.minutes) }))
}

/** From this time, a day logged under half its target is worth asking about. */
export const LOW_DAY_FROM = '18:00'

/**
 * What to ask before suggesting, if anything (meal-suggestions-precision.md §4.6):
 * the usual meals that look missing, or, with none, whether a day that looks
 * low for the hour is complete. Nothing when today is answered as complete,
 * and no "is today complete?" once a usual meal was said to be skipped: the
 * skipped meal is the answer, and one question is enough.
 */
export function todayQuestion(input: {
  missing: readonly MealToCome[]
  eatenKcal: number
  targetKcal: number
  nowTime: string
  completeness?: 'COMPLETE' | 'INCOMPLETE'
  /** Usual meals the person said they skipped today. */
  skipped?: readonly MealSlot[]
}): { kind: 'MISSING'; meals: MealToCome[] } | { kind: 'LOW' } | undefined {
  if (input.completeness === 'COMPLETE') return undefined
  if (input.missing.length > 0) return { kind: 'MISSING', meals: [...input.missing] }
  const low = input.eatenKcal < input.targetKcal * POSSIBLY_INCOMPLETE_SHARE
  const explained = (input.skipped?.length ?? 0) > 0
  if (low && !explained && minutesOf(input.nowTime) >= minutesOf(LOW_DAY_FROM) && input.completeness !== 'INCOMPLETE') {
    return { kind: 'LOW' }
  }
  return undefined
}

/** What the card offers, by today, the meals still to come and the period. */
export type SuggestPlan =
  /**
   * Today has room, after the meals still to come: suggestions that fill it.
   * Close to bedtime, at most 400 kcal, and light (§5.3).
   */
  | { kind: 'FILL'; maxKcal: number; bedtime?: boolean }
  /** Today's room is the meals still to come: better to wait for them. */
  | { kind: 'WAIT'; meals: MealSlot[]; kcal: number }
  /**
   * Today's calories are used (or over) and protein is short: the period's
   * plan range decides. BELOW offers a protein snack as the main action;
   * WITHIN and ABOVE offer only the optional light one.
   */
  | {
      kind: 'USED'
      status: PlanStatus
      /** WEEK when the period was used; TODAY when it had too few counted days. */
      scope: 'WEEK' | 'TODAY'
      balanceKcal: number
      budgetKcal: number
      rangeKcal: number
      maxKcal: number
      /** True for BELOW: "Suggest a protein snack". Otherwise "Hungry? Suggest a light protein snack". */
      primary: boolean
      /** The period's protein is ahead of its targets: said, never a reason to hide the action. */
      proteinAhead: boolean
    }

/**
 * Whether to offer anything, and what (meal-suggestions-precision.md §4.3).
 *
 * - The room today is what is left less the usual meals still to come. With
 *   100 kcal of that: fill it, up to it plus 10%.
 * - Left today, but the meals to come take it: wait for them.
 * - Otherwise nothing, unless protein is short by 10 g. Then the plan range
 *   decides, over the period (or today alone, with too few counted days):
 *   below it, a protein snack up to the room below plan, at most 250 kcal;
 *   within it or above it, only the optional light snack, at most 120.
 */
export function suggestPlan(
  progress: DayProgress,
  week?: WeekSoFar,
  toCome: readonly MealToCome[] = [],
  options: { nearBedtime?: boolean } = {},
): SuggestPlan | undefined {
  const left = progress.energy.remaining
  const kept = toCome.reduce((sum, meal) => sum + meal.usualKcal, 0)
  const room = left - kept
  if (room >= SUGGEST_MIN_KCAL) {
    const maxKcal = Math.round(room * 1.1)
    return options.nearBedtime && maxKcal > BEDTIME_MAX_KCAL
      ? { kind: 'FILL', maxKcal: BEDTIME_MAX_KCAL, bedtime: true }
      : { kind: 'FILL', maxKcal, ...(options.nearBedtime ? { bedtime: true } : {}) }
  }
  if (left >= SUGGEST_MIN_KCAL && toCome.length > 0) {
    return { kind: 'WAIT', meals: toCome.map((meal) => meal.slot), kcal: kept }
  }
  if (progress.protein.remaining < SUGGEST_MIN_PROTEIN_G) return undefined

  const useWeek = !!week && !week.sparse
  const balanceKcal = useWeek ? week!.balanceKcal : Math.round(-left)
  const budgetKcal = useWeek ? week!.budgetKcal : Math.round(progress.energy.target)
  const { rangeKcal, status } = planRange(balanceKcal, budgetKcal)
  const below = status === 'BELOW'
  return {
    kind: 'USED',
    status,
    scope: useWeek ? 'WEEK' : 'TODAY',
    balanceKcal,
    budgetKcal,
    rangeKcal,
    maxKcal: below ? Math.min(PROTEIN_SNACK_MAX_KCAL, -balanceKcal) : LIGHT_SNACK_MAX_KCAL,
    primary: below,
    proteinAhead: useWeek && week!.proteinG >= 0,
  }
}

// --- Phase 3: today's training, counted (meal-suggestions-precision.md §5.2) ---

/** Half of the activity beyond a usual day counts towards today: watches overestimate it. */
export const ACTIVITY_CREDIT_SHARE = 0.5
/** A baseline needs this many earlier days from the same source. */
export const MIN_ACTIVE_BASELINE_DAYS = 5

/** A day's active calories, with where they came from: the same source is compared with itself. */
export interface ActiveReading {
  day: CalendarDate
  kcal: number
  source: string
}

export interface TrainingCredit {
  /** Active calories so far today, and the usual day's, from the same source. */
  activeKcal: number
  baselineKcal: number
  /** Today beyond the usual, and the share of it counted. */
  extraKcal: number
  creditKcal: number
  baselineDays: number
}

/**
 * The extra room today's training earns (§5.2).
 *
 * - Only beyond the usual: the usual burn already includes a usual day's
 *   training, so counting a usual workout again would count it twice.
 * - Equivalent measurements: today's active calories against the usual
 *   active calories from the SAME source (the same watch), never against a
 *   formula's total.
 * - Half of the extra, to start: wrist watches overestimate exercise.
 * - None on a calorie target the person typed in: that is their number.
 * - Never downwards during the day; and the day is settled with its real
 *   burn once it is over, so the credit is never added to a past day.
 */
export function trainingCredit(input: {
  today?: ActiveReading
  history: readonly ActiveReading[]
  ownTarget: boolean
}): TrainingCredit | undefined {
  const today = input.today
  if (!today || input.ownTarget) return undefined
  const same = input.history.filter((r) => r.source === today.source && r.day < today.day)
  if (same.length < MIN_ACTIVE_BASELINE_DAYS) return undefined
  const baselineKcal = Math.round(same.reduce((sum, r) => sum + r.kcal, 0) / same.length)
  const extraKcal = Math.round(today.kcal - baselineKcal)
  if (extraKcal <= 0) return undefined
  return {
    activeKcal: Math.round(today.kcal),
    baselineKcal,
    extraKcal,
    creditKcal: Math.round(extraKcal * ACTIVITY_CREDIT_SHARE),
    baselineDays: same.length,
  }
}

// --- Phase 4: better food choices (§5.3) ---

/** Protein one sitting uses well: about 0.3–0.5 g per kg. The aim, and the most. */
export const PROTEIN_SITTING_AIM_G_PER_KG = 0.4
export const PROTEIN_SITTING_MAX_G_PER_KG = 0.5

export const proteinPerSitting = (weightKg: number): { aimG: number; maxG: number } => ({
  aimG: Math.round(weightKg * PROTEIN_SITTING_AIM_G_PER_KG),
  maxG: Math.round(weightKg * PROTEIN_SITTING_MAX_G_PER_KG),
})

/** A week averaging less fat than this, a day, gets suggestions with some fat. */
export const FAT_FLOOR_G_PER_KG = 0.5

/** The counted days averaged under the fat floor. */
export function fatLow(week: Pick<WeekSoFar, 'fatEatenG' | 'days' | 'sparse'> | undefined, weightKg?: number): boolean {
  if (!week || week.sparse || week.days === 0 || !weightKg) return false
  return week.fatEatenG / week.days < FAT_FLOOR_G_PER_KG * weightKg
}

/** Training that runs on carbs: an hour of it makes carbs part of the answer. */
const ENDURANCE = new Set(['RUNNING', 'CYCLING', 'SWIMMING', 'SOCCER', 'TENNIS'])
export const ENDURANCE_REFUEL_MIN = 60

export type CarbFocus = 'REFUEL' | 'MODERATE' | 'MODEST'

/**
 * What carbs should do, by today's training: refuel after an hour or more of
 * endurance; moderate after strength or other training; modest on a rest day.
 */
export function carbFocus(workouts: readonly { kind: string; minutes: number }[]): CarbFocus {
  const endurance = workouts.filter((w) => ENDURANCE.has(w.kind)).reduce((sum, w) => sum + w.minutes, 0)
  if (endurance >= ENDURANCE_REFUEL_MIN) return 'REFUEL'
  return workouts.some((w) => w.minutes > 0) ? 'MODERATE' : 'MODEST'
}

/** Within this long before the usual bedtime, a suggestion is light. */
export const BEDTIME_WINDOW_MIN = 180
export const BEDTIME_MAX_KCAL = 400
/** A usual bedtime needs this many nights. */
export const MIN_NIGHTS = 5

/**
 * The usual bedtime, "HH:MM", from when nights started: the median, with
 * times after midnight counted as late evening rather than early morning.
 */
export function usualBedtime(starts: readonly string[]): string | undefined {
  if (starts.length < MIN_NIGHTS) return undefined
  const minutes = starts.map((time) => {
    const m = minutesOf(time)
    return m < 12 * 60 ? m + 24 * 60 : m
  })
  const usual = Math.round(median(minutes)) % (24 * 60)
  return hhmmOf(usual)
}

/** Minutes until the usual bedtime, when it is within the window; otherwise undefined. */
export function minutesToBedtime(nowTime: string, bedtime: string | undefined): number | undefined {
  if (!bedtime) return undefined
  let until = minutesOf(bedtime) - minutesOf(nowTime)
  if (until < -12 * 60) until += 24 * 60
  if (until > 12 * 60) until -= 24 * 60
  return until > 0 && until <= BEDTIME_WINDOW_MIN ? until : undefined
}

/** What is left of the day, as the card says it and the model is sent it. */
export function leftOf(progress: DayProgress): Macros {
  return {
    energyKcal: Math.max(0, Math.round(progress.energy.remaining)),
    proteinG: Math.max(0, Math.round(progress.protein.remaining)),
    carbsG: Math.max(0, Math.round(progress.carbs.remaining)),
    fatG: Math.max(0, Math.round(progress.fat.remaining)),
  }
}

const sumOf = (items: readonly { nutrients: Meal['items'][number]['nutrients'] }[]) =>
  items.reduce(
    (sum, item) => ({
      kcal: sum.kcal + item.nutrients.energy.value,
      proteinG: sum.proteinG + item.nutrients.protein.value,
      carbsG: sum.carbsG + item.nutrients.carbs.value,
      fatG: sum.fatG + item.nutrients.fat.value,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  )

export interface SuggestionInput {
  slot: MealSlot
  /** "HH:MM", local. */
  localTime: string
  targets: DailyTargets
  eaten: Macros
  /** The last couple of months of meals, today's included. */
  history: readonly Meal[]
  /** Today's meals. */
  today: readonly Meal[]
  note?: string
  avoid?: readonly string[]
  /** What the card is offering; FILL with today's room when not given. */
  plan?: { kind: 'FILL' | 'PROTEIN'; maxKcal: number }
  week?: WeekSoFar
  toCome?: readonly MealToCome[]
  training?: SuggestionRequest['trainingToday']
  preferences?: FoodPreferences
  /** The person's weight, for protein per sitting and the fat floor. */
  weightKg?: number
  minutesToBedtime?: number
}

/**
 * The request, from the targets, the day so far and the history.
 *
 * Usual meals and foods are the existing "usuals" rules (most repeated, then
 * most recent), so what the model is told you usually eat is exactly what
 * the Again tab already offers you.
 */
export function buildSuggestionRequest(input: SuggestionInput): SuggestionRequest {
  const progress = dayProgress(input.targets, input.eaten)
  const history = input.history.filter((meal) => !meal.retracted && !isPatternFilled(meal))

  const usualMeals = findUsualMeals(history, { limit: MAX_USUAL_MEALS })
    // A "meal" of one food is a usual food; it is listed below, once.
    .filter((usual) => liveItems(usual.template.items).length > 1)
    .map((usual) => {
      const items = liveItems(usual.template.items)
      const sum = sumOf(items)
      return {
        name: items.map((item) => item.name).join(', '),
        foods: items.map((item) => ({ name: item.name, grams: Math.round(item.amount.value) })),
        kcal: Math.round(sum.kcal),
        proteinG: one(sum.proteinG),
        carbsG: one(sum.carbsG),
        fatG: one(sum.fatG),
        timesLogged: usual.count,
        usualSlot: usual.slot,
      }
    })

  const usualFoods = findUsualFoods(history, { limit: MAX_USUAL_FOODS })
    .filter((food) => food.template.amount.value > 0)
    .map((food) => {
      const grams = food.template.amount.value
      const per = (value: number) => one((value / grams) * 100)
      const n = food.template.nutrients
      return {
        name: food.name,
        usualG: Math.round(grams),
        per100g: {
          kcal: Math.round((n.energy.value / grams) * 100),
          proteinG: per(n.protein.value),
          carbsG: per(n.carbs.value),
          fatG: per(n.fat.value),
        },
        timesLogged: food.count,
      }
    })

  const eatenToday = [
    ...new Set(
      input.today
        .filter((meal) => !meal.retracted && !isPatternFilled(meal))
        .flatMap((meal) => liveItems(meal.items).map((item) => item.name.trim()))
        .filter(Boolean),
    ),
  ].slice(0, MAX_TODAY_FOODS)

  const note = input.note?.trim().slice(0, MAX_NOTE_CHARS)
  const avoid = input.avoid?.map((title) => title.trim()).filter(Boolean).slice(0, MAX_SUGGESTIONS * 2)

  return {
    slot: input.slot,
    localTime: input.localTime,
    left: leftOf(progress),
    goal: {
      aim: input.targets.choice?.aim,
      focus: input.targets.choice?.focus ?? [],
      objective: input.targets.objective,
    },
    eatenToday,
    usualMeals,
    usualFoods,
    ...(note ? { note } : {}),
    ...(avoid && avoid.length > 0 ? { avoid } : {}),
    mode: input.plan?.kind ?? 'FILL',
    maxKcal: input.plan?.maxKcal ?? Math.max(0, Math.round(progress.energy.remaining * 1.1)),
    ...(input.week && !input.week.sparse
      ? {
          week: {
            days: input.week.days,
            balanceKcal: input.week.balanceKcal,
            proteinG: input.week.proteinG,
            fatG: input.week.fatG,
            carbsG: input.week.carbsG,
            measuredDays: input.week.measuredDays,
            ...planRange(input.week.balanceKcal, input.week.budgetKcal),
          },
        }
      : {}),
    ...(input.toCome && input.toCome.length > 0 ? { stillToCome: [...input.toCome] } : {}),
    ...(input.training && input.training.workouts.length + (input.training.activeKcal ? 1 : 0) > 0
      ? { trainingToday: input.training }
      : {}),
    ...(input.preferences ? { preferences: input.preferences } : {}),
    ...(input.weightKg
      ? (() => {
          const sitting = proteinPerSitting(input.weightKg)
          return { proteinPerSittingG: { aim: sitting.aimG, max: sitting.maxG } }
        })()
      : {}),
    carbFocus: carbFocus(input.training?.workouts ?? []),
    ...(fatLow(input.week, input.weightKg) ? { fatLow: true } : {}),
    ...(input.minutesToBedtime !== undefined ? { minutesToBedtime: input.minutesToBedtime } : {}),
  }
}

/** A suggestion's numbers, added up from its foods. */
export function totalsOf(foods: readonly Macros[]): Macros {
  const sum = foods.reduce(
    (acc, food) => ({
      energyKcal: acc.energyKcal + food.energyKcal,
      proteinG: acc.proteinG + food.proteinG,
      carbsG: acc.carbsG + food.carbsG,
      fatG: acc.fatG + food.fatG,
    }),
    { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  )
  return {
    energyKcal: Math.round(sum.energyKcal),
    proteinG: one(sum.proteinG),
    carbsG: one(sum.carbsG),
    fatG: one(sum.fatG),
  }
}

export interface SuggestionFit {
  /** Calories to spare after eating it; negative is over. */
  spareKcal: number
  /** True when today was already used up before it: then what it adds is the honest number. */
  todayFull: boolean
  /** The period's balance after it, and where that stands, when the plan range decided. */
  balanceAfter?: number
  statusAfter?: PlanStatus
  /** Protein for the day after eating it, against the target. */
  proteinAfter: number
  proteinTarget: number
  proteinReached: boolean
}

/**
 * How a suggestion leaves the day, and the period when the plan range
 * decided: "+118 kcal today · protein 149 of 145 g ✓ · 5 days +207, within
 * plan range".
 */
export function fitOf(
  suggestion: Pick<MealSuggestion, 'totals'>,
  progress: DayProgress,
  plan?: { balanceKcal: number; budgetKcal: number },
): SuggestionFit {
  const proteinAfter = Math.round(progress.protein.eaten + suggestion.totals.proteinG)
  const proteinTarget = Math.round(progress.protein.target)
  const balanceAfter = plan ? Math.round(plan.balanceKcal + suggestion.totals.energyKcal) : undefined
  return {
    spareKcal: Math.round(progress.energy.remaining - suggestion.totals.energyKcal),
    todayFull: progress.energy.remaining < SUGGEST_MIN_KCAL,
    ...(plan && balanceAfter !== undefined
      ? { balanceAfter, statusAfter: planRange(balanceAfter, plan.budgetKcal).status }
      : {}),
    proteinAfter,
    proteinTarget,
    proteinReached: proteinAfter >= proteinTarget,
  }
}
