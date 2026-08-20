/**
 * Turning an untrusted model reply into an EstimateResult.
 *
 * A language model's JSON is input from a system that can be wrong, creative,
 * or subtly broken — negative grams, confidence of 7, a number as a string,
 * macros that do not add up to the calories claimed. None of that may reach
 * the domain, because once written it is indistinguishable from a measurement.
 *
 * Hand-rolled rather than a schema library: the shape is small and stable, and
 * this is a lean project (no new dependency for twenty lines of checks).
 */
import { EstimateError, type EstimatedItem, type EstimateResult } from './estimator'

/** Calories implied by macros. Atwater factors: 4/4/9 kcal per gram. */
export const kcalFromMacros = (proteinG: number, carbsG: number, fatG: number): number =>
  proteinG * 4 + carbsG * 4 + fatG * 9

/** Flagged, never rejected: real food deviates, and the user can see both numbers. */
export const MACRO_MISMATCH_TOLERANCE = 0.25
export const MACRO_MISMATCH_FLAG = 'MACRO_ARITHMETIC_MISMATCH'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Accepts "12.5" as well as 12.5 — models return both, and rejecting is unhelpful. */
const num = (value: unknown, field: string, { min = 0 }: { min?: number } = {}): number => {
  const parsed = typeof value === 'string' ? Number(value.trim()) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new EstimateError('UNREADABLE', `${field} is not a number`)
  }
  return parsed < min ? min : parsed
}

const optionalNum = (value: unknown, field: string): number | undefined =>
  value === undefined || value === null ? undefined : num(value, field)

/** Out-of-range confidence is clamped, not rejected — the number still ranks items. */
const confidence = (value: unknown): number => {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) return 0.5
  return Math.min(1, Math.max(0, parsed))
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(text).filter((entry) => entry.length > 0) : []

function validateItem(value: unknown, index: number): EstimatedItem {
  if (!isObject(value)) throw new EstimateError('UNREADABLE', `item ${index} is not an object`)

  const name = text(value.name)
  if (!name) throw new EstimateError('UNREADABLE', `item ${index} has no name`)

  return {
    name,
    amountG: num(value.amountG ?? value.grams, `item ${index} amountG`),
    energyKcal: num(value.energyKcal ?? value.kcal, `item ${index} energyKcal`),
    proteinG: num(value.proteinG ?? value.protein, `item ${index} proteinG`),
    carbsG: num(value.carbsG ?? value.carbs, `item ${index} carbsG`),
    fatG: num(value.fatG ?? value.fat, `item ${index} fatG`),
    fiberG: optionalNum(value.fiberG ?? value.fiber, `item ${index} fiberG`),
    confidence: confidence(value.confidence),
  }
}

export function validateEstimate(raw: unknown, model: string): EstimateResult {
  if (!isObject(raw)) throw new EstimateError('UNREADABLE', 'reply is not an object', raw)

  const refusal = text(raw.refusal) || text(raw.notFood)
  const assumptions = stringList(raw.assumptions)

  if (refusal) {
    // The model says this is not food. That is a valid answer, not a failure.
    return { items: [], overallConfidence: 0, assumptions, refusal, flags: [], raw, model }
  }

  const rawItems = raw.items
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new EstimateError('UNREADABLE', 'reply contains no items', raw)
  }

  const items = rawItems.map(validateItem)
  const flags: string[] = []

  const claimed = items.reduce((sum, item) => sum + item.energyKcal, 0)
  const implied = items.reduce(
    (sum, item) => sum + kcalFromMacros(item.proteinG, item.carbsG, item.fatG),
    0,
  )
  if (claimed > 0 && Math.abs(implied - claimed) / claimed > MACRO_MISMATCH_TOLERANCE) {
    flags.push(MACRO_MISMATCH_FLAG)
  }

  const overall =
    raw.overallConfidence === undefined
      ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length
      : confidence(raw.overallConfidence)

  return { items, overallConfidence: overall, assumptions, flags, raw, model }
}

/**
 * Applies the user's hints after the fact.
 *
 * The prompt asks the model to honour them, but a model that ignores an
 * explicit "250 g" cannot be allowed to overrule the person holding the
 * scales — so the totals are rescaled here. Belt and braces, deliberately.
 */
export function applyGramsHint(result: EstimateResult, totalGrams?: number): EstimateResult {
  if (!totalGrams || totalGrams <= 0 || result.items.length === 0) return result

  const estimatedTotal = result.items.reduce((sum, item) => sum + item.amountG, 0)
  if (estimatedTotal <= 0) return result
  const factor = totalGrams / estimatedTotal
  // Already within a rounding error of what the user said: leave it alone.
  if (Math.abs(factor - 1) < 0.01) return result

  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      amountG: item.amountG * factor,
      energyKcal: item.energyKcal * factor,
      proteinG: item.proteinG * factor,
      carbsG: item.carbsG * factor,
      fatG: item.fatG * factor,
      fiberG: item.fiberG === undefined ? undefined : item.fiberG * factor,
    })),
    assumptions: [...result.assumptions, `Scaled to the ${totalGrams} g you entered.`],
  }
}
