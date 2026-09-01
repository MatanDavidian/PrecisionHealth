import { scaleTo, type Portioned } from './mealEdits'

/**
 * What came back on the plate.
 *
 * The commonest way a logged meal is wrong is not the estimate — it is that you
 * did not finish it. A photograph of the plate afterwards is the cheapest
 * possible correction: the model already knows what was on it, so all it has to
 * judge is how much is left.
 *
 * Per food, not per meal. "I ate all the eggs and half the toast" is the normal
 * shape of a leftover, and a single percentage applied to everything would move
 * protein and carbohydrate in step when the whole point is that they did not.
 */
export interface LeftoverPortion {
  /** Which food, by position in the meal's live items. */
  index: number
  /** 0..1 — how much of THIS food was eaten. 1 is all of it. */
  eatenFraction: number
  /** The model's own words: "fully eaten", "about half eaten". */
  note?: string
}

export interface LeftoverEstimate {
  portions: LeftoverPortion[]
  /** Which model said so, for the audit row (D13). */
  model: string
  /** 0..1 across the whole judgement. */
  confidence: number
  raw?: unknown
}

/** Nothing outside 0..1 means anything here, and a model can return anything. */
export const clampFraction = (value: number): number =>
  !Number.isFinite(value) ? 1 : Math.min(1, Math.max(0, value))

/**
 * The meal as it was actually eaten.
 *
 * A food the estimate does not mention is left ALONE — treated as fully eaten
 * rather than fully left. The asymmetry is deliberate: the failure of "assume
 * eaten" is that a leftover goes unrecorded and the day reads slightly high,
 * which is the same as not using this feature. The failure of "assume left" is
 * that food you did eat silently vanishes from the day, and you would have no
 * reason to go looking for it.
 *
 * A food eaten to zero keeps its row at 0 g instead of being deleted. The
 * numbers came from a model, and a model should not be able to remove a record
 * on its own — the row stays visible and the editor's own Remove is one tap
 * away for anyone who agrees with it.
 */
export function applyLeftover<T extends Portioned>(
  items: readonly T[],
  estimate: Pick<LeftoverEstimate, 'portions'>,
): T[] {
  const byIndex = new Map(estimate.portions.map((p) => [p.index, clampFraction(p.eatenFraction)]))
  return items.map((item, index) => {
    const eaten = byIndex.get(index)
    if (eaten === undefined || eaten === 1) return item
    return scaleTo(item, round(item.amountG * eaten))
  })
}

const round = (value: number): number => Math.round(value * 10) / 10

/**
 * How much of the meal was eaten, as one number, weighted by calories.
 *
 * Weighted by energy rather than by weight, because that is what the figure is
 * for: "72% of this meal was eaten" is a claim about what reached you, and 200 g
 * of lettuce and 200 g of cheese are not the same 200 g. Averaging the per-food
 * fractions would say the same thing about a plate where the leftover was the
 * salad as one where it was the steak.
 */
export function eatenShare(before: readonly Portioned[], after: readonly Portioned[]): number {
  const total = before.reduce((sum, item) => sum + item.energyKcal, 0)
  if (total <= 0) return 1
  const eaten = after.reduce((sum, item) => sum + item.energyKcal, 0)
  return clampFraction(eaten / total)
}

/** True when the estimate would actually change the meal. */
export const leftoverChangesAnything = (
  items: readonly Portioned[],
  estimate: Pick<LeftoverEstimate, 'portions'>,
): boolean =>
  estimate.portions.some(
    (p) => items[p.index] !== undefined && clampFraction(p.eatenFraction) < 1,
  )
