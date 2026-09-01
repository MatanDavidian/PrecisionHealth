/**
 * Writing a leftover back onto a meal that is already logged.
 *
 * The same shape every correction here takes: a NEW meal version (D15) whose
 * changed foods supersede the old ones (D4). Nothing is overwritten, so the
 * meal as originally logged stays readable, and so does the fact that it was
 * later cut down.
 *
 * What differs from an ordinary edit is whose numbers these are. When a person
 * types 260 over the model's 320, that is confirmation — a human looked and
 * said what it should be. A leftover is the opposite: the human supplied
 * evidence and the MODEL produced the numbers. So the scaled foods carry
 * AI_ESTIMATE provenance pointing at the inference that made them, and they
 * need confirming, exactly as a photo estimate does. Pressing "apply" is
 * agreeing to record the claim, not vouching for it.
 */
import {
  aiEstimate,
  applyLeftover,
  canonical,
  convert,
  eatenShare,
  liveItems,
  type AIInference,
  type AIInferenceId,
  type FoodItem,
  type FoodItemId,
  type LeftoverEstimate,
  type Meal,
  type Portioned,
  type UserId,
} from '@/domain'
import { newId } from './newRecords'

/** The foods as the model must see them: named, weighed, and indexed by order. */
export const plateOf = (meal: Meal): { name: string; amountG: number }[] =>
  liveItems(meal.items).map((item) => ({
    name: item.name,
    amountG: convert(item.amount, 'g'),
  }))

/** The live foods as plain numbers, which is what the arithmetic works on. */
const portionsOf = (meal: Meal): Portioned[] =>
  liveItems(meal.items).map((item) => ({
    amountG: convert(item.amount, 'g'),
    energyKcal: convert(item.nutrients.energy, 'kcal'),
    proteinG: convert(item.nutrients.protein, 'g'),
    carbsG: convert(item.nutrients.carbs, 'g'),
    fatG: convert(item.nutrients.fat, 'g'),
  }))

/** What the result card shows before anything is written. */
export interface LeftoverPreview {
  /** 0..1, weighted by calories. */
  eaten: number
  rows: { name: string; eatenFraction: number; note?: string }[]
  /** False when the estimate says the whole meal was eaten. */
  changesAnything: boolean
}

export function previewLeftover(meal: Meal, estimate: LeftoverEstimate): LeftoverPreview {
  const before = portionsOf(meal)
  const after = applyLeftover(before, estimate)
  const live = liveItems(meal.items)
  const byIndex = new Map(estimate.portions.map((p) => [p.index, p]))

  return {
    eaten: eatenShare(before, after),
    rows: live.map((item, index) => ({
      name: item.name,
      eatenFraction: byIndex.get(index)?.eatenFraction ?? 1,
      note: byIndex.get(index)?.note,
    })),
    changesAnything: before.some((item, i) => Math.abs(item.amountG - after[i].amountG) > 0.05),
  }
}

/**
 * The next version of the meal, cut down to what was actually eaten.
 *
 * Returns the inference too, and the caller writes it first: a meal whose
 * foods point at an audit row that does not exist is worse than an audit row
 * for a meal that was never saved.
 */
export function buildLeftoverMeal(
  userId: UserId,
  meal: Meal,
  estimate: LeftoverEstimate,
  source: { kind: 'photo'; sha256: string } | { kind: 'text'; description: string },
  recordedAt = new Date().toISOString(),
): { meal: Meal; inference: AIInference } {
  const inferenceId = newId() as AIInferenceId
  const before = portionsOf(meal)
  const after = applyLeftover(before, estimate)
  const live = liveItems(meal.items)

  const corrections: FoodItem[] = []
  live.forEach((item, index) => {
    const eaten = after[index]
    if (Math.abs(eaten.amountG - before[index].amountG) < 0.05) return
    corrections.push({
      ...item,
      id: newId() as FoodItemId,
      amount: canonical(eaten.amountG, 'g'),
      nutrients: {
        energy: canonical(eaten.energyKcal, 'kcal'),
        protein: canonical(eaten.proteinG, 'g'),
        carbs: canonical(eaten.carbsG, 'g'),
        fat: canonical(eaten.fatG, 'g'),
        // Fibre is not something the leftover estimate speaks to, so it is
        // scaled with everything else rather than dropped.
        ...(item.nutrients.fiber
          ? {
              fiber: canonical(
                convert(item.nutrients.fiber, 'g') *
                  (before[index].amountG > 0 ? eaten.amountG / before[index].amountG : 1),
                'g',
              ),
            }
          : {}),
      },
      /*
        An estimate, not a confirmation. These numbers came from a model
        looking at a photograph, and the app must not claim the person checked
        them — they agreed to record the claim, which is a different act. The
        item shows as needing confirmation until they say otherwise.
      */
      provenance: {
        ...aiEstimate(recordedAt, estimate.confidence, inferenceId),
        supersedes: [item.id],
      },
    })
  })

  const inference: AIInference = {
    id: inferenceId,
    userId,
    purpose: 'FOOD_LEFTOVER_ESTIMATE',
    model: estimate.model,
    modelVersion: estimate.model,
    createdAt: recordedAt,
    confidence: estimate.confidence,
    // The photo is not stored, so its hash stands in for it (spec §3). A
    // sentence is small enough to keep, and is kept below.
    inputReferences: [
      `meal:${meal.id}`,
      ...(source.kind === 'photo' ? [`photo:${source.sha256}`] : []),
    ],
    output: {
      ...(source.kind === 'text' ? { description: source.description } : {}),
      plate: plateOf(meal),
      portions: estimate.portions,
      eatenShare: eatenShare(before, after),
      raw: estimate.raw,
    },
    userConfirmed: false,
    safetyFlags: estimate.confidence < 0.5 ? ['LOW_CONFIDENCE'] : [],
  }

  return {
    meal: {
      ...meal,
      recordId: newId(),
      version: meal.version + 1,
      items: [...meal.items, ...corrections],
    },
    inference,
  }
}
