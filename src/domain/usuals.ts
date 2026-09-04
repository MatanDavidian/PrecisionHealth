/**
 * The meals you keep eating.
 *
 * Most days are not novel: the same breakfast, the same mid-afternoon apple.
 * Photographing them again costs a minute of waiting and a fraction of a cent
 * to be told what you already knew. This finds what you repeat, so logging it
 * again is one tap — no photo, no model, no estimate to review.
 *
 * Everything here is pure: it reads meals you have already logged and proposes
 * new ones. Nothing decides what is true.
 */
import type { FoodItem, Meal, MealId, MealSlot } from './nutrition'
import type { IdFactory } from './corrections'
import type { CanonicalQuantity } from './units'
import { zonedTimeToUtc, type CalendarDate, type IanaZone } from './time'
import type { UserId } from './user'
import { needsConfirmation, userEntered, type Provenance } from './provenance'
import { liveItems } from './corrections'

/** Names differ by capitals and spacing far more often than by meaning. */
const normalise = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * What makes two meals "the same meal" for the purpose of repeating.
 *
 * The set of foods in it, not the amounts: eggs and oats is eggs and oats
 * whether the plate was 300g or 340g. Order-independent, because a meal is a
 * set and the order items were typed carries no meaning.
 */
export const mealSignature = (meal: Meal): string =>
  liveItems(meal.items)
    .map((item) => normalise(item.name))
    .filter(Boolean)
    .sort()
    .join(' + ')

export interface UsualMeal {
  signature: string
  /** The most recent instance, whose amounts and numbers a repeat copies. */
  template: Meal
  /** How many times this exact combination has been logged in the window. */
  count: number
  /** When it was last eaten. */
  lastAt: string
  /** The slot it is most often eaten at. */
  slot: MealSlot
  /** True when every number in it has been reviewed by a human. */
  confirmed: boolean
}

export interface UsualFood {
  name: string
  /** The most recent instance, whose amount and numbers a repeat copies. */
  template: FoodItem
  count: number
  lastAt: string
  confirmed: boolean
}

const instantOf = (meal: Meal): string =>
  meal.time.kind === 'daily'
    ? `${meal.time.date}T00:00:00.000Z`
    : meal.time.kind === 'interval'
      ? meal.time.start
      : meal.time.at

/** A meal nobody has had to review — manual, or an estimate since confirmed. */
const isConfirmed = (meal: Meal): boolean =>
  liveItems(meal.items).every((item) => !needsConfirmation(item.provenance))

/**
 * The meals worth offering back, most-repeated first.
 *
 * Ranked by how often, then how recently — a breakfast eaten twelve times
 * beats one eaten twice, and among equals the fresher memory wins. Deliberately
 * not a decaying score: a rule you can explain in a sentence is one a user can
 * predict, and predictability is what makes a suggestion feel like a shortcut
 * rather than a guess.
 */
export function findUsualMeals(
  meals: readonly Meal[],
  options: { slot?: MealSlot; limit?: number } = {},
): UsualMeal[] {
  const groups = new Map<string, Meal[]>()

  for (const meal of meals) {
    if (meal.retracted) continue
    const signature = mealSignature(meal)
    if (!signature) continue
    const group = groups.get(signature)
    if (group) group.push(meal)
    else groups.set(signature, [meal])
  }

  const usuals: UsualMeal[] = []
  for (const [signature, group] of groups) {
    const byRecency = [...group].sort((a, b) => instantOf(b).localeCompare(instantOf(a)))
    const template = byRecency[0]

    // The slot it is USUALLY eaten at, not the slot of the last one — an
    // ordinary breakfast eaten once at midnight is still a breakfast.
    const slotCounts = new Map<MealSlot, number>()
    for (const meal of group) slotCounts.set(meal.slot, (slotCounts.get(meal.slot) ?? 0) + 1)
    const slot = [...slotCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]

    usuals.push({
      signature,
      template,
      count: group.length,
      lastAt: instantOf(template),
      slot,
      confirmed: isConfirmed(template),
    })
  }

  const matching = options.slot ? usuals.filter((u) => u.slot === options.slot) : usuals
  matching.sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
  return options.limit ? matching.slice(0, options.limit) : matching
}

/**
 * Single foods you add on their own — the banana, the coffee, the carrot.
 *
 * Separate from whole meals because they combine: a snack is often two of
 * these rather than a repeat of anything.
 */
export function findUsualFoods(
  meals: readonly Meal[],
  options: { limit?: number } = {},
): UsualFood[] {
  const groups = new Map<string, { items: FoodItem[]; lastAt: string; template: FoodItem }>()

  for (const meal of meals) {
    if (meal.retracted) continue
    const at = instantOf(meal)
    for (const item of liveItems(meal.items)) {
      const key = normalise(item.name)
      if (!key) continue
      const group = groups.get(key)
      if (!group) {
        groups.set(key, { items: [item], lastAt: at, template: item })
      } else {
        group.items.push(item)
        if (at > group.lastAt) {
          group.lastAt = at
          group.template = item
        }
      }
    }
  }

  const foods: UsualFood[] = [...groups.values()].map((group) => ({
    name: group.template.name,
    template: group.template,
    count: group.items.length,
    lastAt: group.lastAt,
    confirmed: !needsConfirmation(group.template.provenance),
  }))

  foods.sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
  return options.limit ? foods.slice(0, options.limit) : foods
}

/**
 * Provenance for a repeated item.
 *
 * Repeating is the user asserting they ate this again, so a reviewed number
 * becomes a plain user entry. But an AI estimate nobody ever confirmed does
 * NOT become confirmed by being repeated — it stays an estimate, still linked
 * to the inference that produced it, because that is where the number actually
 * came from. Laundering a guess into a fact by copying it is exactly the
 * failure this app is built to avoid.
 */
const repeatedProvenance = (source: Provenance, at: string): Provenance =>
  needsConfirmation(source)
    ? { ...source, recordedAt: at, supersedes: undefined }
    : userEntered(at)

const copyItem = (item: FoodItem, mealId: MealId, at: string, newId: IdFactory): FoodItem => ({
  ...item,
  id: newId() as FoodItem['id'],
  mealId,
  provenance: repeatedProvenance(item.provenance, at),
})

export interface RepeatOptions {
  at: Date
  zone: IanaZone
  slot: MealSlot
  newId: IdFactory
}

/** Logs a past meal again, as a new meal at version 1. */
export function repeatMeal(template: Meal, userId: UserId, options: RepeatOptions): Meal {
  const at = options.at.toISOString()
  const mealId = options.newId() as MealId

  return {
    id: mealId,
    recordId: options.newId(),
    version: 1,
    userId,
    slot: options.slot,
    time: { kind: 'instant', at, zone: options.zone },
    items: liveItems(template.items).map((item) => copyItem(item, mealId, at, options.newId)),
    notes: template.notes,
    provenance: userEntered(at),
    // A copy, not a reference. Editing this meal must never reach back into the
    // one it came from; the link only records where it came from.
    repeatedFromMealId: template.id,
  }
}

/** Builds one meal out of individually chosen foods. */
export function mealFromFoods(
  foods: readonly UsualFood[],
  userId: UserId,
  options: RepeatOptions,
): Meal {
  const at = options.at.toISOString()
  const mealId = options.newId() as MealId

  return {
    id: mealId,
    recordId: options.newId(),
    version: 1,
    userId,
    slot: options.slot,
    time: { kind: 'instant', at, zone: options.zone },
    items: foods.map((food) => copyItem(food.template, mealId, at, options.newId)),
    provenance: userEntered(at),
  }
}

/** The local wall-clock time a meal was eaten, as "HH:MM". */
export function timeOfDay(meal: Meal, zone: IanaZone): string {
  const at = instantOf(meal)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at))
}

export interface RepeatDayResult {
  /** Meals ready to log, each at the time of day it was eaten before. */
  meals: Meal[]
  /** Meals left out because their hour has not come round yet today. */
  skipped: Meal[]
}

/**
 * Repeats a whole day — the days that look like every other day.
 *
 * Each meal lands at the time of day it was eaten before, not all at once:
 * breakfast at 07:38 belongs at 07:38, and stacking three meals onto this
 * minute would make the day's shape a lie.
 *
 * Meals whose hour has NOT yet come round are deliberately left out. Copying
 * tonight's dinner at two in the afternoon would add calories and protein to a
 * total for food nobody has eaten, and a tracker that counts meals in advance
 * is worse than useless — it is confidently wrong. Repeat again after dinner
 * and it is one more tap.
 */
export function repeatDay(
  source: readonly Meal[],
  userId: UserId,
  options: { onDate: CalendarDate; zone: IanaZone; now: Date; newId: IdFactory },
): RepeatDayResult {
  const meals: Meal[] = []
  const skipped: Meal[] = []

  for (const meal of [...source].sort((a, b) => instantOf(a).localeCompare(instantOf(b)))) {
    if (meal.retracted) continue
    const at = new Date(zonedTimeToUtc(options.onDate, timeOfDay(meal, options.zone), options.zone))
    if (at.getTime() > options.now.getTime()) {
      skipped.push(meal)
      continue
    }
    meals.push(
      repeatMeal(meal, userId, { at, zone: options.zone, slot: meal.slot, newId: options.newId }),
    )
  }

  return { meals, skipped }
}

/** Free-text match over what a meal or food is called. */
export const matchesQuery = (names: readonly string[], query: string): boolean => {
  const needle = normalise(query)
  if (!needle) return true
  return names.some((name) => normalise(name).includes(needle))
}

/** Totals for a set of chosen foods, for the "2 selected · 600 kcal" line. */
export const totalEnergy = (foods: readonly UsualFood[]): CanonicalQuantity =>
  foods.reduce(
    (total, food) => ({ ...total, value: total.value + food.template.nutrients.energy.value }),
    { value: 0, unit: 'kcal', __canonical: true } as CanonicalQuantity,
  )
