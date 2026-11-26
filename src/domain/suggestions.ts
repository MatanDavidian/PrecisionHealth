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
import { dayProgress, type DailyTargets, type DayProgress } from './targets'
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
  /** The week so far, Sunday to now, against its targets: negative is under. */
  week?: { days: number; balanceKcal: number; measuredDays: number }
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
/** "Hungry anyway?" after the card said to stop: something very light. */
export const LIGHT_SNACK_MAX_KCAL = 120
/**
 * A day's recorded burn below this share of the usual one is taken as a watch
 * that stopped counting (a flat battery, left on the charger), not as a day of
 * lying still: the day is weighed against its target instead.
 */
export const PLAUSIBLE_BURN_SHARE = 0.6

/** One day of the week, as the balance needs it. */
export interface WeekDayInput {
  eatenKcal: number
  targets?: Pick<DailyTargets, 'energyKcal' | 'balanceKcal' | 'energy'>
  /** What the day really burned, if a watch or the person recorded it. */
  burnedKcal?: number
}

export interface WeekSoFar {
  /** Days that counted: with food on them, and targets. */
  days: number
  /** Eaten minus budget, summed: negative is under. Today's eaten against today's target. */
  balanceKcal: number
  /** Of the days before today, how many used a recorded burn. */
  measuredDays: number
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
 * The week so far, Sunday to now: eaten against budget, day by day.
 *
 * Days before today count what they really burned where it was recorded
 * (a watch, or a number typed on Today), so a long run on Tuesday leaves room
 * that the same day's average target would not show. Today is weighed against
 * its target, because today's burn is not finished. A day with nothing on it
 * is left out: it is a day not logged, not a day of eating nothing.
 */
export function weekSoFar(before: readonly WeekDayInput[], today: WeekDayInput): WeekSoFar {
  let balance = 0
  let days = 0
  let measuredDays = 0
  for (const day of before) {
    if (day.eatenKcal <= 0) continue
    const budget = budgetOf(day)
    if (!budget) continue
    balance += day.eatenKcal - budget.kcal
    days += 1
    if (budget.measured) measuredDays += 1
  }
  if (today.targets) {
    balance += today.eatenKcal - today.targets.energyKcal
    days += 1
  }
  return { days, balanceKcal: Math.round(balance), measuredDays }
}

/** What the card offers, by today and the week. */
export type SuggestPlan =
  /** Today has room: suggestions that fill it. */
  | { kind: 'FILL'; maxKcal: number }
  /** Today is used, protein is short, the week has room: a lean protein snack. */
  | { kind: 'PROTEIN'; maxKcal: number }
  /** Protein is short but neither today nor the week has room: better to stop. */
  | { kind: 'STOP' }

/**
 * Whether to offer anything, and what.
 *
 * - Enough calories left today (100): fill them, up to what is left plus 10%.
 * - Otherwise nothing, unless protein is short by 10 g. Then the week
 *   decides: room in it (100 kcal or more under, today included) allows a
 *   lean protein snack, up to that room and never more than 250 kcal; no room
 *   says it is better to stop for today, and costs nothing to say.
 */
export function suggestPlan(progress: DayProgress, week?: WeekSoFar): SuggestPlan | undefined {
  const left = progress.energy.remaining
  if (left >= SUGGEST_MIN_KCAL) return { kind: 'FILL', maxKcal: Math.round(left * 1.1) }
  if (progress.protein.remaining < SUGGEST_MIN_PROTEIN_G) return undefined
  // Without the week, today alone decides, and today has no room by now.
  const room = week ? -week.balanceKcal : left
  if (room >= SUGGEST_MIN_KCAL) return { kind: 'PROTEIN', maxKcal: Math.min(PROTEIN_SNACK_MAX_KCAL, Math.round(room)) }
  return { kind: 'STOP' }
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
    ...(input.week ? { week: input.week } : {}),
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
  /** The week's balance after it, when the week is known: negative is under. */
  weekAfter?: number
  /** Protein for the day after eating it, against the target. */
  proteinAfter: number
  proteinTarget: number
  proteinReached: boolean
}

/** How a suggestion leaves the day: "Leaves 14 kcal · protein 140 of 140 g". */
export function fitOf(
  suggestion: Pick<MealSuggestion, 'totals'>,
  progress: DayProgress,
  week?: WeekSoFar,
): SuggestionFit {
  const proteinAfter = Math.round(progress.protein.eaten + suggestion.totals.proteinG)
  const proteinTarget = Math.round(progress.protein.target)
  return {
    spareKcal: Math.round(progress.energy.remaining - suggestion.totals.energyKcal),
    todayFull: progress.energy.remaining < SUGGEST_MIN_KCAL,
    ...(week ? { weekAfter: Math.round(week.balanceKcal + suggestion.totals.energyKcal) } : {}),
    proteinAfter,
    proteinTarget,
    proteinReached: proteinAfter >= proteinTarget,
  }
}
