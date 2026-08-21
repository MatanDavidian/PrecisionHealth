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
  toCanonical,
  userEntered,
  type FoodItem,
  type FoodItemId,
  type IanaZone,
  type Meal,
  type MealId,
  type MealSlot,
  type Nutrients,
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
