import type { EnergyUnit, Id, Instant, MassUnit, Quantity, TimeSemantics } from './primitives'
import type { Provenance } from './provenance'
import type { UserId } from './user'

export type MealId = Id<'Meal'>
export type FoodItemId = Id<'FoodItem'>
export type AttachmentId = Id<'Attachment'>

export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'

/** Macro/micro totals. Extend with fibre, sodium, micros as the model grows. */
export interface Nutrients {
  energy: Quantity<EnergyUnit>
  protein: Quantity<MassUnit>
  carbs: Quantity<MassUnit>
  fat: Quantity<MassUnit>
  fiber?: Quantity<MassUnit>
}

/** A single food within a meal. AI photo logging produces these as estimates. */
export interface FoodItem {
  id: FoodItemId
  mealId: MealId
  name: string
  amount: Quantity<MassUnit>
  nutrients: Nutrients
  provenance: Provenance
}

export interface Meal {
  id: MealId
  userId: UserId
  slot: MealSlot
  time: TimeSemantics
  items: FoodItem[]
  /** Photo the meal was logged from, when it came from AI food logging. */
  photoId?: AttachmentId
  notes?: string
  provenance: Provenance
}

export type AttachmentKind = 'FOOD_PHOTO' | 'BODY_PHOTO' | 'LAB_DOCUMENT'

export interface Attachment {
  id: AttachmentId
  userId: UserId
  kind: AttachmentKind
  /** Key in object storage, never the bytes themselves. */
  storageKey: string
  contentType: string
  capturedAt: Instant
}
