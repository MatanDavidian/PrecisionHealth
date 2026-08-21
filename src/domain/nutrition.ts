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

export interface Meal {
  id: MealId
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
