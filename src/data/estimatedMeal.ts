/**
 * Turning an AI estimate into domain records.
 *
 * Two records are written together and reference each other: the Meal, whose
 * every item carries AI_ESTIMATE provenance pointing at the inference, and the
 * AIInference itself, which holds what the model was asked, what it replied,
 * and what the input was — but never the photo (spec §3).
 *
 * Nothing here is confirmed. The items arrive unconfirmed by construction, and
 * the slice-1 Confirm flow is what settles them.
 *
 * Photo and text are the same shape deliberately. A written meal is no less an
 * estimate than a photographed one; it is a weaker one, and the only honest way
 * to express that is the confidence the model returns — not a different record
 * type that the rest of the app would have to learn about.
 */
import {
  aiEstimate,
  canonical,
  userEntered,
  type AIInference,
  type AIInferenceId,
  type FoodItem,
  type FoodItemId,
  type IanaZone,
  type Meal,
  type MealId,
  type MealSlot,
  type Nutrients,
  type Portioned,
  type UserId,
} from '@/domain'
import type { EstimateHints, EstimateResult, PhotoMeta } from '@/ai/estimator'
import { newId } from './newRecords'

/**
 * What the model was shown.
 *
 * The photo is described but not kept (Q10). The description IS kept: it is a
 * sentence the user typed, it is what makes the estimate explainable a month
 * later, and none of the reasons a photo is not stored apply to it.
 */
export type EstimateSource =
  | { kind: 'photo'; photo: PhotoMeta }
  | { kind: 'text'; description: string }

/**
 * One estimated item as the user corrected it, before anything was saved.
 *
 * Positional rather than keyed by id, because an estimate has no ids yet — it
 * is a reply from a model, not a record. The corrections travel alongside the
 * result rather than replacing it: `EstimateResult` is what the model actually
 * said, and it has to stay that way to be worth anything as an audit trail.
 */
export interface EstimateCorrection extends Portioned {
  index: number
  name: string
  /** Dropped from the meal entirely — the model saw something that was not eaten. */
  removed?: boolean
}

export interface EstimatedMealInput {
  slot: MealSlot
  at: Date
  zone: IanaZone
  hints: EstimateHints
  source: EstimateSource
  result: EstimateResult
  /**
   * What the user changed on screen before saving, if anything.
   *
   * Absent means they accepted the estimate as given, which is the common case
   * and stays the cheap path.
   */
  corrections?: EstimateCorrection[]
}

/** The editable rows a correction form starts from. */
export const correctionsFrom = (result: EstimateResult): EstimateCorrection[] =>
  result.items.map((item, index) => ({
    index,
    name: item.name,
    amountG: round(item.amountG),
    energyKcal: round(item.energyKcal),
    proteinG: round(item.proteinG),
    carbsG: round(item.carbsG),
    fatG: round(item.fatG),
  }))

/** Whole-ish numbers: what a person would type, not what a float holds. */
const round = (value: number): number => Math.round(value * 10) / 10

/** Floating point, and the form rounds for display — so compare at that precision. */
const close = (a: number, b: number): boolean => Math.abs(a - b) < 0.05

/** True when this row is no longer what the model said. */
const changed = (item: EstimateResult['items'][number], edit: EstimateCorrection): boolean =>
  item.name.trim() !== edit.name.trim() ||
  !close(item.amountG, edit.amountG) ||
  !close(item.energyKcal, edit.energyKcal) ||
  !close(item.proteinG, edit.proteinG) ||
  !close(item.carbsG, edit.carbsG) ||
  !close(item.fatG, edit.fatG)

/** True when saving these corrections would differ from saving the estimate. */
export const correctsAnything = (
  result: EstimateResult,
  corrections: EstimateCorrection[],
): boolean =>
  corrections.some(
    (edit) => edit.removed || (result.items[edit.index] && changed(result.items[edit.index], edit)),
  )

const nutrientsOf = (item: Portioned & { fiberG?: number }): Nutrients => ({
  energy: canonical(item.energyKcal, 'kcal'),
  protein: canonical(item.proteinG, 'g'),
  carbs: canonical(item.carbsG, 'g'),
  fat: canonical(item.fatG, 'g'),
  ...(item.fiberG === undefined ? {} : { fiber: canonical(item.fiberG, 'g') }),
})

export function buildEstimatedMeal(
  userId: UserId,
  input: EstimatedMealInput,
): { meal: Meal; inference: AIInference } {
  const at = input.at.toISOString()
  const inferenceId = newId() as AIInferenceId
  const mealId = newId() as MealId
  const fromPhoto = input.source.kind === 'photo'

  const byIndex = new Map((input.corrections ?? []).map((edit) => [edit.index, edit]))

  const items: FoodItem[] = input.result.items.flatMap((item, index) => {
    const edit = byIndex.get(index)
    if (edit?.removed) return []

    /**
     * A corrected number is a user entry, not an estimate.
     *
     * A human looked at what the model said and wrote down what it should be;
     * that is precisely confirmation, and it would be strange for correcting a
     * guess to leave it needing confirmation. The same rule `applyMealEdit`
     * applies to a saved meal — one rule, at two moments.
     */
    const corrected = edit !== undefined && changed(item, edit)
    const source = corrected ? edit : item

    return [
      {
        id: newId() as FoodItemId,
        mealId,
        name: (corrected ? edit.name : item.name).trim(),
        amount: canonical(source.amountG, 'g'),
        // Fibre is never editable in the form; carry over what was estimated
        // rather than silently dropping it.
        nutrients: nutrientsOf({ ...source, fiberG: item.fiberG }),
        // Per-item confidence, not the overall figure: one dish can be obvious
        // while another on the same plate is a guess.
        provenance: corrected ? userEntered(at) : aiEstimate(at, item.confidence, inferenceId),
      },
    ]
  })

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
    /**
     * The meal's own provenance stays an estimate even when items were
     * corrected. "This meal began as a photo estimate" is still true after you
     * fix the grams, and the item chain already records who authored each
     * number — the same reasoning `applyMealEdit` gives for leaving it alone.
     */
    provenance: aiEstimate(at, input.result.overallConfidence, inferenceId),
  }

  const inference: AIInference = {
    id: inferenceId,
    userId,
    purpose: fromPhoto ? 'FOOD_PHOTO_ESTIMATE' : 'FOOD_TEXT_ESTIMATE',
    model: input.result.model,
    modelVersion: input.result.model,
    createdAt: at,
    confidence: input.result.overallConfidence,
    // The photo is gone; its hash identifies what was analyzed. A description
    // needs no such stand-in — it is small enough to keep verbatim, below.
    inputReferences:
      input.source.kind === 'photo' ? [`photo:${input.source.photo.sha256}`] : [],
    output: {
      ...(input.source.kind === 'photo'
        ? { photoMeta: input.source.photo }
        : { description: input.source.description }),
      hints: input.hints,
      assumptions: input.result.assumptions,
      // What the human overrode, so the audit answers both halves of "why does
      // it say that?" — what the model claimed, and what was corrected.
      ...(input.corrections && correctsAnything(input.result, input.corrections)
        ? { corrections: input.corrections }
        : {}),
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
    description?: string
    kind: string
    message: string
    raw?: unknown
  },
): AIInference {
  return {
    id: newId() as AIInferenceId,
    userId,
    purpose: args.description ? 'FOOD_TEXT_ESTIMATE' : 'FOOD_PHOTO_ESTIMATE',
    model: args.model,
    modelVersion: args.model,
    createdAt: args.at.toISOString(),
    confidence: 0,
    inputReferences: args.photo ? [`photo:${args.photo.sha256}`] : [],
    output: {
      photoMeta: args.photo,
      description: args.description,
      hints: args.hints,
      error: args.message,
      raw: args.raw,
    },
    userConfirmed: false,
    safetyFlags: [`FAILED_${args.kind}`],
  }
}
