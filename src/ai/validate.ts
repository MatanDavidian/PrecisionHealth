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
import {
  EstimateError,
  type EstimatedItem,
  type EstimateResult,
  type WeekInsight,
} from './estimator'
import {
  clampFraction,
  MAX_SUGGESTIONS,
  totalsOf,
  type LeftoverEstimate,
  type LeftoverPortion,
  type MealSuggestion,
  type MealSuggestions,
  type SuggestedFood,
  type SuggestionSource,
} from '@/domain'

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
  // Optional by design, and a non-string is simply no question — a model that
  // returns `true` here should not cost anyone their estimate.
  const question = text(raw.question) || undefined
  // Both are decoration on the question: if the model omits or mangles them
  // the question still stands, so neither may fail an estimate.
  const questionReason = question ? text(raw.questionReason) || undefined : undefined
  const questionOptions = question ? stringList(raw.questionOptions).slice(0, 4) : []

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

  return {
    items,
    overallConfidence: overall,
    assumptions,
    question,
    questionReason,
    ...(questionOptions.length > 0 ? { questionOptions } : {}),
    flags,
    raw,
    model,
  }
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

/**
 * Turning the model's week reply into a `WeekInsight`.
 *
 * Softer than `validateEstimate` on purpose. An estimate that arrives malformed
 * must fail, because a wrong number becomes indistinguishable from a
 * measurement once written. An insight is prose the user reads and judges — a
 * missing suggestions array is a thinner answer, not a corrupt one, so the
 * shape is repaired rather than rejected.
 */
export function validateInsight(raw: unknown, model: string): WeekInsight {
  if (!isObject(raw)) throw new EstimateError('UNREADABLE', 'reply is not an object', raw)

  const summary = text(raw.summary)
  const observations = stringList(raw.observations).slice(0, 6)
  const suggestions = stringList(raw.suggestions).slice(0, 4)

  // Nothing to show at all is a failure; the model was asked for a sentence
  // even when its answer is "there is not enough here to tell".
  if (!summary && observations.length === 0) {
    throw new EstimateError('UNREADABLE', 'reply carried no summary or observations', raw)
  }

  return {
    summary,
    observations,
    suggestions,
    confidence: confidence(raw.confidence),
    raw,
    model,
  }
}

/**
 * A leftover judgement, made safe.
 *
 * The fractions matter more than usual here, because they SUBTRACT from a meal
 * that is already recorded. A hallucinated 0 removes food the person ate, and
 * nothing on screen afterwards would say why the day is short. So an index that
 * is not a number, or one no food occupies, is dropped rather than guessed at,
 * and every fraction is clamped into 0..1 before it can reach the arithmetic.
 */
export function validateLeftover(raw: unknown, model: string, plateSize: number): LeftoverEstimate {
  if (!isObject(raw)) throw new EstimateError('UNREADABLE', 'Reply was not an object', raw)
  const list = Array.isArray(raw.portions) ? raw.portions : Array.isArray(raw.items) ? raw.items : []

  const portions: LeftoverPortion[] = []
  for (const entry of list) {
    if (!isObject(entry)) continue
    const index = Number(entry.index)
    if (!Number.isInteger(index) || index < 0 || index >= plateSize) continue
    const eaten =
      entry.eatenFraction !== undefined
        ? Number(entry.eatenFraction)
        : entry.eaten !== undefined
          ? Number(entry.eaten)
          : Number.NaN
    if (!Number.isFinite(eaten)) continue
    portions.push({
      index,
      eatenFraction: clampFraction(eaten > 1 && eaten <= 100 ? eaten / 100 : eaten),
      ...(text(entry.note) ? { note: text(entry.note) } : {}),
    })
  }

  if (portions.length === 0) {
    throw new EstimateError('UNREADABLE', 'No usable portions in the reply', raw)
  }

  return { portions, model, confidence: confidence(raw.confidence), raw }
}


/** No real food carries more than this per gram (pure fat is 9). */
const MAX_KCAL_PER_GRAM = 9.5
/** The most foods one suggestion may have. Past this it is a menu, not a snack. */
const MAX_SUGGESTED_FOODS = 6
const SOURCES: readonly SuggestionSource[] = ['USUAL', 'FOODS', 'NEW']

/** One suggested food, or undefined when its numbers cannot be real. */
function suggestedFood(value: unknown): SuggestedFood | undefined {
  if (!isObject(value)) return undefined
  const name = text(value.name)
  const read = (field: unknown) => {
    const parsed = typeof field === 'string' ? Number(field.trim()) : field
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : Number.NaN
  }
  const food = {
    name,
    amountG: read(value.amountG),
    energyKcal: read(value.energyKcal),
    proteinG: read(value.proteinG),
    carbsG: read(value.carbsG),
    fatG: read(value.fatG),
  }
  if (!name) return undefined
  const numbers = [food.amountG, food.energyKcal, food.proteinG, food.carbsG, food.fatG]
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return undefined
  if (food.amountG <= 0 || food.amountG > 2000) return undefined
  if (food.energyKcal > food.amountG * MAX_KCAL_PER_GRAM) return undefined
  // Half a gram for rounding: 10 g of rice cake can say 10.1 g of macros.
  if (food.proteinG + food.carbsG + food.fatG > food.amountG * 1.01 + 0.5) return undefined
  // Macros that say a quarter more calories than claimed (or a quarter fewer,
  // with something to count) are not a rounding difference; they are wrong.
  const implied = kcalFromMacros(food.proteinG, food.carbsG, food.fatG)
  if (food.energyKcal > 20 && Math.abs(implied - food.energyKcal) > food.energyKcal * MACRO_MISMATCH_TOLERANCE + 15) {
    return undefined
  }
  return food
}

/**
 * The model's suggestions, made safe (docs/features/meal-suggestions.md).
 *
 * Strict on numbers, soft on words. A suggestion is about to be logged with
 * one tap, so a food whose numbers cannot be real takes the whole suggestion
 * with it, and the totals are always added up here rather than read from the
 * model. A missing "why" is a thinner answer, not a corrupt one. At most three
 * survive, and at most one of them a new idea; an answer with none left is
 * an error the card offers to retry.
 */
export function validateSuggestions(raw: unknown, model: string, maxKcal?: number): MealSuggestions {
  if (!isObject(raw)) throw new EstimateError('UNREADABLE', 'reply is not an object', raw)
  const list = Array.isArray(raw.suggestions) ? raw.suggestions : []

  const suggestions: MealSuggestion[] = []
  let newIdeas = 0
  for (const entry of list) {
    if (suggestions.length >= MAX_SUGGESTIONS) break
    if (!isObject(entry)) continue
    const title = text(entry.title)
    const foodsRaw = Array.isArray(entry.foods) ? entry.foods : []
    if (!title || foodsRaw.length === 0 || foodsRaw.length > MAX_SUGGESTED_FOODS) continue
    const foods = foodsRaw.map(suggestedFood)
    if (foods.some((food) => food === undefined)) continue
    const source: SuggestionSource = SOURCES.includes(entry.source as SuggestionSource)
      ? (entry.source as SuggestionSource)
      : 'NEW'
    if (source === 'NEW') {
      if (newIdeas >= 1) continue
      newIdeas += 1
    }
    const kept = foods as SuggestedFood[]
    const totals = totalsOf(kept)
    // The cap the card states is the cap enforced, with no tolerance
    // (meal-suggestions-precision.md §4.5): "up to 120 kcal" means 120.
    if (maxKcal !== undefined && totals.energyKcal > maxKcal) continue
    suggestions.push({ title, source, why: text(entry.why), foods: kept, totals })
  }

  if (suggestions.length === 0) {
    throw new EstimateError('UNREADABLE', 'reply carried no usable suggestion', raw)
  }
  const note = text(raw.note)
  return { suggestions, ...(note ? { note } : {}), raw, model }
}
