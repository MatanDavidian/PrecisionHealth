/**
 * Editing a meal that is already logged.
 *
 * The rule that makes this non-trivial: nothing is mutated (D4) and no version
 * is rewritten (D15). An edit is a NEW meal record at `version + 1`, and inside
 * it a changed food is a NEW item superseding the old one — the same supersede
 * chain a Confirm writes, because a correction and a confirmation are the same
 * act with different amounts.
 *
 * Two consequences worth stating, because they look like bugs otherwise:
 *
 *  - Editing an AI estimate makes it USER_CONFIRMED. A human looked at the
 *    number and said what it should be; that is precisely confirmation, and it
 *    would be strange for correcting a guess to leave it needing confirmation.
 *  - The meal's own provenance is left alone. "This meal began as a photo
 *    estimate" stays true after you fix the grams, and the item chain already
 *    records who authored each number.
 */
import { confirmFoodItem, liveItems, type IdFactory } from './corrections'
import type { FoodItem, FoodItemId, Meal, MealSlot } from './nutrition'
import { canonical, convert, type CanonicalQuantity } from './units'
import type { Instant } from './time'

/**
 * Anything with a weight and the numbers that scale with it.
 *
 * Named separately from `FoodItemEdit` because the same arithmetic applies
 * before a meal exists at all: an AI estimate on the Log screen is re-portioned
 * by exactly the rule below, and it has no record id to carry. Structural, so
 * neither caller has to declare a relationship to the other.
 */
export interface Portioned {
  /** Grams. */
  amountG: number
  energyKcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

/** One live item as the user edited it — plain numbers, converted here (D8). */
export interface FoodItemEdit extends Portioned {
  id: FoodItemId
  name: string
}

export interface MealEdit {
  /** Present only when changed. */
  slot?: MealSlot
  /** New instant for the meal, when the time was changed. */
  at?: Instant
  items: FoodItemEdit[]
  /** Live items dropped from this version entirely. */
  removed?: FoodItemId[]
  notes?: string
}

const grams = (item: FoodItem): number => convert(item.amount, 'g')

/** What the form shows for an item, before the user touches anything. */
export const editableItem = (item: FoodItem): FoodItemEdit => ({
  id: item.id,
  name: item.name,
  amountG: round(grams(item)),
  energyKcal: round(convert(item.nutrients.energy, 'kcal')),
  proteinG: round(convert(item.nutrients.protein, 'g')),
  carbsG: round(convert(item.nutrients.carbs, 'g')),
  fatG: round(convert(item.nutrients.fat, 'g')),
})

/** Whole grams and calories, one decimal for macros — what a person would type. */
const round = (value: number): number => Math.round(value * 10) / 10

/**
 * Re-portioning: change the weight and the numbers follow by ratio.
 *
 * The commonest correction by far is "the model saw 320 g, it was more like
 * 260" — and re-typing four macros to match is arithmetic the app should do.
 * Typing over any single number afterwards simply overwrites it, which is how
 * the link is broken; there is no mode to leave.
 *
 * A zero-weight item cannot be scaled (nothing to scale from), so its numbers
 * are returned untouched rather than zeroed.
 */
export function scaleTo<T extends Portioned>(edit: T, amountG: number): T {
  if (edit.amountG <= 0 || amountG < 0) return { ...edit, amountG }
  const ratio = amountG / edit.amountG
  return {
    ...edit,
    amountG,
    energyKcal: round(edit.energyKcal * ratio),
    proteinG: round(edit.proteinG * ratio),
    carbsG: round(edit.carbsG * ratio),
    fatG: round(edit.fatG * ratio),
  }
}

/** How much one Refill adds to the portion. */
export const REFILL_STEP = 0.1

/**
 * The most Refill will push a single food to, in grams.
 *
 * A ceiling rather than a judgement about what anyone can eat: without one, a
 * button that multiplies runs away in a handful of taps, and a number nobody
 * meant to type is worse than a button that stops.
 */
export const REFILL_MAX_G = 900

/**
 * One press of Refill: ten percent more food, and every number follows.
 *
 * The portion is the thing people get wrong, and they get it wrong in one
 * direction — a bowl is bigger than the model thought, a second helping went
 * unlogged. Ten percent is small enough to press twice without thinking and
 * large enough to be worth pressing once.
 *
 * Compounding, deliberately: each press is ten percent of what is on screen,
 * not of what was saved, so three presses read as three helpings rather than
 * arithmetic about an original nobody is looking at any more.
 *
 * The `+ 1` floor is a correction to the design's plain `round`, which is a
 * no-op below 5 g — ten percent of 4 rounds back to 4, and the button would
 * look broken on exactly the small items where a gram matters most. It also
 * avoids `ceil`, which trips over binary floating point: 100 * 1.1 is
 * 110.00000000000001, and ceil would make that 111.
 */
export function refill<T extends Portioned>(edit: T): T {
  // Nothing to take ten percent OF. Without this the `+ 1` floor below would
  // give a weightless item a gram and leave its macros where they were.
  if (edit.amountG <= 0) return edit
  const next = Math.min(REFILL_MAX_G, Math.max(edit.amountG + 1, Math.round(edit.amountG * (1 + REFILL_STEP))))
  // Never shrinks. An item already at or above the ceiling stays where it is
  // rather than being quietly pulled back down to it.
  return next <= edit.amountG ? edit : scaleTo(edit, next)
}

/** False once Refill can no longer add anything, so the button can say so. */
export const canRefill = (edit: Portioned): boolean =>
  edit.amountG > 0 && edit.amountG < REFILL_MAX_G

const sameNumbers = (item: FoodItem, edit: FoodItemEdit): boolean =>
  item.name.trim() === edit.name.trim() &&
  close(grams(item), edit.amountG) &&
  close(convert(item.nutrients.energy, 'kcal'), edit.energyKcal) &&
  close(convert(item.nutrients.protein, 'g'), edit.proteinG) &&
  close(convert(item.nutrients.carbs, 'g'), edit.carbsG) &&
  close(convert(item.nutrients.fat, 'g'), edit.fatG)

/** Floating point, and the form rounds for display — so compare at that precision. */
const close = (a: number, b: number): boolean => Math.abs(a - b) < 0.05

/**
 * Every id in a removal's supersede chain.
 *
 * Dropping a correction without dropping what it corrected would resurrect the
 * old value: `liveItems` hides an item only while something still supersedes
 * it. So a removal takes its whole history with it — the earlier versions of
 * the meal still hold every one of these records, which is where D4's audit
 * trail actually lives.
 */
function withSuperseded(items: readonly FoodItem[], removed: readonly FoodItemId[]): Set<string> {
  const byId = new Map(items.map((item) => [String(item.id), item]))
  const gone = new Set<string>()
  const queue = removed.map(String)

  while (queue.length > 0) {
    const id = queue.pop()!
    if (gone.has(id)) continue
    gone.add(id)
    for (const superseded of byId.get(id)?.provenance.supersedes ?? []) queue.push(superseded)
  }

  return gone
}

const nutrientsOf = (
  edit: FoodItemEdit,
): { energy: CanonicalQuantity; protein: CanonicalQuantity; carbs: CanonicalQuantity; fat: CanonicalQuantity } => ({
  energy: canonical(edit.energyKcal, 'kcal'),
  protein: canonical(edit.proteinG, 'g'),
  carbs: canonical(edit.carbsG, 'g'),
  fat: canonical(edit.fatG, 'g'),
})

/**
 * The next version of a meal, carrying the user's edits.
 *
 * Returns a new record; `meal` is untouched and stays in history. Items the
 * user did not actually change are left exactly as they were — an edit dialog
 * opened and cancelled-by-saving must not rewrite provenance on five foods.
 */
export function applyMealEdit(
  meal: Meal,
  edit: MealEdit,
  recordedAt: Instant,
  newId: IdFactory,
): Meal {
  const removed = withSuperseded(meal.items, edit.removed ?? [])
  const kept = meal.items.filter((item) => !removed.has(String(item.id)))
  const live = new Map(liveItems(kept).map((item) => [String(item.id), item]))

  const corrections: FoodItem[] = []
  for (const change of edit.items) {
    const current = live.get(String(change.id))
    if (!current || sameNumbers(current, change)) continue
    corrections.push(
      confirmFoodItem(current, recordedAt, newId, {
        name: change.name.trim(),
        amount: canonical(change.amountG, 'g'),
        nutrients: {
          ...nutrientsOf(change),
          // Fibre is not editable in the form; carry over what was estimated
          // rather than silently dropping it.
          ...(current.nutrients.fiber ? { fiber: current.nutrients.fiber } : {}),
        },
      }),
    )
  }

  return {
    ...meal,
    recordId: newId(),
    version: meal.version + 1,
    slot: edit.slot ?? meal.slot,
    time:
      edit.at && meal.time.kind === 'instant'
        ? { ...meal.time, at: edit.at }
        : meal.time,
    items: [...kept, ...corrections],
    notes: edit.notes?.trim() || meal.notes,
  }
}

/** True when saving this edit would write a new version at all. */
export function changesAnything(meal: Meal, edit: MealEdit): boolean {
  if ((edit.removed ?? []).length > 0) return true
  if (edit.slot && edit.slot !== meal.slot) return true
  if (edit.at && meal.time.kind === 'instant' && edit.at !== meal.time.at) return true
  const live = new Map(liveItems(meal.items).map((item) => [String(item.id), item]))
  return edit.items.some((change) => {
    const current = live.get(String(change.id))
    return current ? !sameNumbers(current, change) : false
  })
}
