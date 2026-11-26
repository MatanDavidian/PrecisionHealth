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

/**
 * Whether to offer suggestions at all.
 *
 * Only while the day has room: enough calories left for something real, or
 * protein short while calories are not over. On target with nothing short,
 * or over, suggesting more food would be the wrong thing to say.
 */
export function hasRoom(progress: DayProgress): boolean {
  if (progress.energy.state === 'OVER') return false
  return (
    progress.energy.remaining >= SUGGEST_MIN_KCAL || progress.protein.remaining >= SUGGEST_MIN_PROTEIN_G
  )
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
  /** Protein for the day after eating it, against the target. */
  proteinAfter: number
  proteinTarget: number
  proteinReached: boolean
}

/** How a suggestion leaves the day: "Leaves 14 kcal · protein 140 of 140 g". */
export function fitOf(suggestion: Pick<MealSuggestion, 'totals'>, progress: DayProgress): SuggestionFit {
  const proteinAfter = Math.round(progress.protein.eaten + suggestion.totals.proteinG)
  const proteinTarget = Math.round(progress.protein.target)
  return {
    spareKcal: Math.round(progress.energy.remaining - suggestion.totals.energyKcal),
    proteinAfter,
    proteinTarget,
    proteinReached: proteinAfter >= proteinTarget,
  }
}
