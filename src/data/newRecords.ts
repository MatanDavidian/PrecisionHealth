/**
 * Builders for records created by the user, in the browser.
 *
 * ASSUMPTION (see docs/OPEN_QUESTIONS.md, Q1): new records are stamped with the
 * DEVICE's current IANA timezone, not the profile's. Where you physically are
 * when you eat is what decides which day the meal belongs to, and the device
 * knows that; the profile setting can be stale after travel.
 */
import {
  canonical,
  dayKey,
  toCanonical,
  userEntered,
  zonedTimeToUtc,
  type CalendarDate,
  type FoodItem,
  type FoodItemId,
  type Goal,
  type GoalDirection,
  type GoalId,
  type GoalMetric,
  type IanaZone,
  type Meal,
  type MealId,
  type MealSlot,
  type Nutrients,
  type Observation,
  type ObservationCode,
  type ObservationId,
  type Unit,
  type UserId,
} from '@/domain'

export const deviceZone = (): IanaZone => Intl.DateTimeFormat().resolvedOptions().timeZone

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

export interface FoodItemInput {
  name: string
  /** Grams. */
  amount: number
  energyKcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export interface MealInput {
  slot: MealSlot
  /** Local wall-clock time on the day being logged, as the user typed it. */
  at: Date
  items: FoodItemInput[]
  notes?: string
}

const nutrientsOf = (input: FoodItemInput): Nutrients => ({
  energy: canonical(input.energyKcal, 'kcal'),
  protein: canonical(input.proteinG, 'g'),
  carbs: canonical(input.carbsG, 'g'),
  fat: canonical(input.fatG, 'g'),
})

/** Turns raw form input into a domain Meal, converting units at the edge (D8). */
export function buildMeal(userId: UserId, input: MealInput, zone = deviceZone()): Meal {
  const at = input.at.toISOString()
  const provenance = userEntered(at)
  const mealId = newId() as MealId

  const items: FoodItem[] = input.items.map((item) => ({
    id: newId() as FoodItemId,
    mealId,
    name: item.name.trim(),
    amount: toCanonical({ value: item.amount, unit: 'g' }),
    nutrients: nutrientsOf(item),
    provenance,
  }))

  return {
    id: mealId,
    recordId: newId(),
    version: 1,
    userId,
    slot: input.slot,
    time: { kind: 'instant', at, zone },
    items,
    notes: input.notes?.trim() || undefined,
    provenance,
  }
}

/**
 * Meal slot suggested from the hour, so the common case needs no thought.
 *
 * Boundaries are deliberate rather than even: 00:00-04:00 is NIGHT (eating at
 * 01:00 is not breakfast), and late evening is SNACK rather than a second
 * dinner. Always a suggestion — the picker is one tap away.
 */
export const suggestSlot = (date: Date): MealSlot => {
  const hour = date.getHours()
  if (hour < 4) return 'NIGHT'
  if (hour < 11) return 'BREAKFAST'
  if (hour < 16) return 'LUNCH'
  if (hour < 22) return 'DINNER'
  return 'SNACK'
}

/**
 * The instant to stamp on something recorded FOR a given day.
 *
 * Today gets the actual time, because that is when it happened. A past day
 * gets midday LOCAL to the zone being recorded in — twelve hours clear of
 * either boundary, so nothing short of a timezone change can push it onto a
 * neighbouring date. Pretending to know that yesterday's weight was taken at
 * 07:14 would be inventing detail.
 *
 * Not midday everywhere: no instant shares a date worldwide, since the globe
 * spans twenty-six hours of clock. It does not need to. The record carries the
 * zone it was made in (D7), and that is the one it is read back through.
 */
export function instantOn(day: CalendarDate, zone = deviceZone()): string {
  const now = new Date()
  if (dayKey(now.toISOString(), zone) === day) return now.toISOString()
  return zonedTimeToUtc(day, '12:00', zone)
}

export interface ObservationInput {
  code: ObservationCode
  /** As the user typed it, in `unit` — converted to canonical here (D8). */
  value: number
  unit: Unit
  /** The day it belongs to, which is not always today. */
  day: CalendarDate
}

/** A measurement the user entered by hand. USER provenance, no confirming needed. */
export function buildObservation(
  userId: UserId,
  input: ObservationInput,
  zone = deviceZone(),
): Observation {
  const at = instantOn(input.day, zone)
  return {
    id: newId() as ObservationId,
    userId,
    code: input.code,
    time: { kind: 'instant', at, zone },
    value: toCanonical({ value: input.value, unit: input.unit }),
    provenance: userEntered(at),
  }
}

export interface GoalInput {
  metric: GoalMetric
  target: number
  unit: Unit
  direction: GoalDirection
  /** Defaults to today: a goal you set now did not apply retroactively. */
  startsOn?: CalendarDate
}

/**
 * A target the user set.
 *
 * Always `active`, always new. Superseding an old goal is what
 * `currentGoals` is for — nothing here rewrites the previous one, because
 * what you used to be aiming for is part of the story (D4).
 */
export function buildGoal(userId: UserId, input: GoalInput, zone = deviceZone()): Goal {
  const today = dayKey(new Date().toISOString(), zone)
  return {
    id: newId() as GoalId,
    userId,
    metric: input.metric,
    direction: input.direction,
    target: toCanonical({ value: input.target, unit: input.unit }),
    startsOn: input.startsOn ?? today,
    active: true,
    provenance: userEntered(new Date().toISOString()),
  }
}

