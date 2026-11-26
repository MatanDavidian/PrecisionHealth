import type { Id } from './ids'
import type { CalendarDate, IanaZone, Instant } from './time'
import type { MassUnit, LengthUnit, Quantity } from './units'
import type { ActivityLevel } from './targets'

export type UserId = Id<'User'>

export interface User {
  id: UserId
  email: string
  createdAt: Instant
}

export type Sex = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED'

/** The profile details the daily targets use, and that sign-in carries into an account. */
export type ProfileDetail = 'height' | 'birthYear' | 'sex' | 'activity' | 'foodPreferences'

export const PROFILE_DETAILS: readonly ProfileDetail[] = ['height', 'birthYear', 'sex', 'activity', 'foodPreferences']

/**
 * Ways of eating the suggestions must follow (meal-suggestions.md). Rules, not
 * tastes: a vegetarian is never offered tuna, and "no meat with dairy" never
 * puts the two in one suggestion.
 */
export type FoodDiet =
  | 'VEGETARIAN'
  | 'VEGAN'
  | 'NO_MEAT_WITH_DAIRY'
  | 'NO_PORK'
  | 'NO_FISH'
  | 'LACTOSE_FREE'
  | 'GLUTEN_FREE'

export const FOOD_DIETS: readonly FoodDiet[] = [
  'VEGETARIAN',
  'VEGAN',
  'NO_MEAT_WITH_DAIRY',
  'NO_PORK',
  'NO_FISH',
  'LACTOSE_FREE',
  'GLUTEN_FREE',
]

/** The longest "anything else to avoid" worth keeping: a list, not a diary. */
export const MAX_AVOID_CHARS = 200

export interface FoodPreferences {
  diets: FoodDiet[]
  /** The person's own words: "peanuts (allergy), mushrooms". */
  avoid?: string
}

/** Preferences as kept: known diets only, the words trimmed and bounded. */
export function cleanFoodPreferences(value: unknown): FoodPreferences | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as { diets?: unknown; avoid?: unknown }
  const diets = FOOD_DIETS.filter((diet) => Array.isArray(raw.diets) && raw.diets.includes(diet))
  const avoid = typeof raw.avoid === 'string' ? raw.avoid.trim().slice(0, MAX_AVOID_CHARS) : ''
  if (diets.length === 0 && !avoid) return undefined
  return { diets, ...(avoid ? { avoid } : {}) }
}

export interface UserProfile {
  userId: UserId
  displayName: string
  birthDate?: CalendarDate
  /** Present because reference ranges and body-composition formulas need it — not for personalisation copy. */
  sex?: Sex
  height?: Quantity<LengthUnit>
  /**
   * The year only: age is what the burn estimate needs, and a full date of
   * birth would be more than that asks for (docs/features/daily-targets.md).
   */
  birthYear?: number
  /** How active a day usually is. Used only when no watch reports a burn. */
  activity?: ActivityLevel
  /**
   * The details the person gave themselves, as opposed to the sample's.
   *
   * Signed out, the profile starts as the sample person's (178 cm, 36), and
   * one record per person has no id to tell the two apart the way meals do
   * (adoption.ts). This list is what sign-in carries into an account, so the
   * sample's details never travel and the person's own always do.
   */
  youSet?: ProfileDetail[]
  /** What suggestions must follow: ways of eating, and anything to avoid. */
  foodPreferences?: FoodPreferences
  /**
   * The zone stamped onto new records. Historical records keep the zone they
   * were created with, so changing this never rewrites the past.
   */
  timezone: IanaZone
  /** Display preferences. Storage stays canonical regardless. */
  preferredMassUnit: MassUnit
  preferredLengthUnit: LengthUnit
}
