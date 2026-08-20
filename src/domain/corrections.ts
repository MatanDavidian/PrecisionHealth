/**
 * Corrections — the write half of D4 and D6.
 *
 * A correction never edits the record it corrects. It creates a NEW record,
 * carrying the value the user chose, whose provenance lists every id it
 * supersedes. `resolveEffective` then hides the originals, so the correction
 * becomes the effective value without anything being lost.
 *
 * This is what makes "the AI guessed, I fixed it" recoverable, and what makes
 * an AI write reversible: the estimate is still there, still linked to its
 * AIInference, still explaining itself.
 */
import type { FoodItem } from './nutrition'
import type { Observation } from './observation'
import type { Provenance } from './provenance'
import type { Instant } from './time'

/** Ids are generated at the edge; the domain only needs a supplier. */
export type IdFactory = () => string

export const confirmedProvenance = (recordedAt: Instant, supersedes: string[]): Provenance => ({
  source: 'USER',
  kind: 'USER_CONFIRMED',
  recordedAt,
  supersedes,
})

/**
 * The user settled a disagreement (D6) by picking one of the candidates.
 *
 * The result supersedes ALL candidates including the chosen one — the chosen
 * record stays in history as the device reading it was, while the new record
 * carries the same value as a human decision. Those are different facts and the
 * model should not conflate them.
 */
export function confirmObservation(
  chosen: Observation,
  candidates: readonly Observation[],
  recordedAt: Instant,
  newId: IdFactory,
): Observation {
  return {
    ...chosen,
    id: newId() as Observation['id'],
    provenance: confirmedProvenance(
      recordedAt,
      candidates.map((c) => c.id),
    ),
  }
}

/**
 * The user accepted (or corrected) an AI portion estimate.
 *
 * `amend` carries any edits — accepting unchanged is simply an empty amend.
 */
export function confirmFoodItem(
  item: FoodItem,
  recordedAt: Instant,
  newId: IdFactory,
  amend: Partial<Pick<FoodItem, 'name' | 'amount' | 'nutrients'>> = {},
): FoodItem {
  return {
    ...item,
    ...amend,
    id: newId() as FoodItem['id'],
    provenance: confirmedProvenance(recordedAt, [item.id]),
  }
}

/**
 * Items inside an aggregate follow the same supersede rule, so a meal's
 * effective contents are its items minus the ones a correction replaced.
 */
export function liveItems(items: readonly FoodItem[]): FoodItem[] {
  const superseded = new Set(items.flatMap((item) => item.provenance.supersedes ?? []))
  return items.filter((item) => !superseded.has(item.id))
}
