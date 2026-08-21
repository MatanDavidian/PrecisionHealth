/**
 * Turning an AI estimate into domain records.
 *
 * Two records are written together and reference each other: the Meal, whose
 * every item carries AI_ESTIMATE provenance pointing at the inference, and the
 * AIInference itself, which holds what the model was asked, what it replied,
 * and what the photo was — but never the photo (spec §3).
 *
 * Nothing here is confirmed. The items arrive unconfirmed by construction, and
 * the slice-1 Confirm flow is what settles them.
 */
import {
  aiEstimate,
  canonical,
  type AIInference,
  type AIInferenceId,
  type FoodItem,
  type FoodItemId,
  type IanaZone,
  type Meal,
  type MealId,
  type MealSlot,
  type Nutrients,
  type UserId,
} from '@/domain'
import type { EstimateHints, EstimateResult, PhotoMeta } from '@/ai/estimator'
import { newId } from './newRecords'

export interface PhotoMealInput {
  slot: MealSlot
  at: Date
  zone: IanaZone
  hints: EstimateHints
  photo: PhotoMeta
  result: EstimateResult
}

const nutrientsOf = (item: EstimateResult['items'][number]): Nutrients => ({
  energy: canonical(item.energyKcal, 'kcal'),
  protein: canonical(item.proteinG, 'g'),
  carbs: canonical(item.carbsG, 'g'),
  fat: canonical(item.fatG, 'g'),
  ...(item.fiberG === undefined ? {} : { fiber: canonical(item.fiberG, 'g') }),
})

export function buildPhotoMeal(
  userId: UserId,
  input: PhotoMealInput,
): { meal: Meal; inference: AIInference } {
  const at = input.at.toISOString()
  const inferenceId = newId() as AIInferenceId
  const mealId = newId() as MealId

  const items: FoodItem[] = input.result.items.map((item) => ({
    id: newId() as FoodItemId,
    mealId,
    name: item.name,
    amount: canonical(item.amountG, 'g'),
    nutrients: nutrientsOf(item),
    // Per-item confidence, not the overall figure: one dish can be obvious
    // while another on the same plate is a guess.
    provenance: aiEstimate(at, item.confidence, inferenceId),
  }))

  const meal: Meal = {
    id: mealId,
    recordId: newId(),
    version: 1,
    userId,
    slot: input.slot,
    time: { kind: 'instant', at, zone: input.zone },
    items,
    // photoId is deliberately unset: the photo is not stored (spec §3).
    notes: input.result.assumptions.length > 0 ? input.result.assumptions.join(' ') : undefined,
    provenance: aiEstimate(at, input.result.overallConfidence, inferenceId),
  }

  const inference: AIInference = {
    id: inferenceId,
    userId,
    purpose: 'FOOD_PHOTO_ESTIMATE',
    model: input.result.model,
    modelVersion: input.result.model,
    createdAt: at,
    confidence: input.result.overallConfidence,
    // The photo is gone; its hash identifies what was analyzed.
    inputReferences: [`photo:${input.photo.sha256}`],
    output: {
      photoMeta: input.photo,
      hints: input.hints,
      assumptions: input.result.assumptions,
      raw: input.result.raw,
    },
    userConfirmed: false,
    safetyFlags: input.result.flags,
  }

  return { meal, inference }
}

/** A failed attempt is still part of the audit trail (spec §6). */
export function buildFailedInference(
  userId: UserId,
  args: {
    at: Date
    model: string
    hints: EstimateHints
    photo?: PhotoMeta
    kind: string
    message: string
    raw?: unknown
  },
): AIInference {
  return {
    id: newId() as AIInferenceId,
    userId,
    purpose: 'FOOD_PHOTO_ESTIMATE',
    model: args.model,
    modelVersion: args.model,
    createdAt: args.at.toISOString(),
    confidence: 0,
    inputReferences: args.photo ? [`photo:${args.photo.sha256}`] : [],
    output: { photoMeta: args.photo, hints: args.hints, error: args.message, raw: args.raw },
    userConfirmed: false,
    safetyFlags: [`FAILED_${args.kind}`],
  }
}
