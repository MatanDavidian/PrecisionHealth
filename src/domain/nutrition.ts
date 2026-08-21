/**
 * Nutrition.
 *
 * A Meal is an aggregate: it owns its FoodItems and they have no meaning apart
 * from it. Provenance lives on the ITEM, not only the meal — a photo-logged
 * lunch routinely mixes one AI-estimated portion with two the user typed, and
 * flattening that to a single meal-level source would lose exactly the
 * distinction the product exists to keep.
 */
import type { Id } from './ids'
import type { CanonicalQuantity } from './units'
import type { Provenance } from './provenance'
import type { TimeSemantics } from './time'
import type { UserId } from './user'

export type MealId = Id<'Meal'>
export type FoodItemId = Id<'FoodItem'>
export type AttachmentId = Id<'Attachment'>

/**
 * NIGHT covers the small hours. A 01:00 meal is not breakfast — it belongs to
 * the night you are still awake in, and calling it breakfast misfiles both the
 * habit and the pattern anyone would later look for.
 *
 * Note this is about LABELLING, not about which day the meal counts toward:
 * that is the day boundary in `time.ts` (currently local midnight, see
 * OPEN_QUESTIONS Q4).
 */
export type MealSlot = 'NIGHT' | 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'

/** Chronological through a day, for pickers and grouping. */
export const MEAL_SLOTS: MealSlot[] = ['NIGHT', 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']

export interface Nutrients {
  energy: CanonicalQuantity
  protein: CanonicalQuantity
  carbs: CanonicalQuantity
  fat: CanonicalQuantity
  fiber?: CanonicalQuantity
}

export interface FoodItem {
  id: FoodItemId
  mealId: MealId
  name: string
  amount: CanonicalQuantity
  nutrients: Nutrients
  provenance: Provenance
}

/**
 * A meal, at one version (D15).
 *
 * Meals are never updated in place. Every edit appends a NEW record sharing
 * `id` with an incremented `version`, so each device only ever ADDS records —
 * which is what lets two devices sync by taking the union of what they hold,
 * with nothing overwritten.
 *
 * `id` is the meal a person would point at ("my lunch"). `recordId` identifies
 * one version of it, and is what storage keys on. Two records with the same
 * `(id, version)` but different `recordId`s mean two devices edited the same
 * base — a conflict, raised for the user to settle.
 */
export interface Meal {
  /** Stable across every version of this meal. FoodItem.mealId points here. */
  id: MealId
  /** Unique to this version. The storage key. */
  recordId: string
  /** Starts at 1, incremented by every edit. */
  version: number
  userId: UserId
  slot: MealSlot
  time: TimeSemantics
  items: FoodItem[]
  photoId?: AttachmentId
  notes?: string
  provenance: Provenance
}

export type AttachmentKind = 'FOOD_PHOTO' | 'BODY_PHOTO' | 'LAB_DOCUMENT'

export interface Attachment {
  id: AttachmentId
  userId: UserId
  kind: AttachmentKind
  /** Object-storage key. The bytes never enter the relational model. */
  storageKey: string
  contentType: string
  capturedAt: string
}
