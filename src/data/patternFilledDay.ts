/**
 * Turning a typical day into records for a day that was left blank.
 *
 * The arithmetic lives in `@/domain/patternFill`; this is the part that writes,
 * and it exists separately for the same reason `estimatedMeal.ts` does — the
 * domain does not know about ids, clocks or repositories.
 */
import { instantOn, newId } from './newRecords'
import {
  asId,
  type CalendarDate,
  type FoodItem,
  type FoodItemId,
  type Meal,
  type MealId,
  type TypicalDay,
  type UserId,
} from '@/domain'
import { deviceZone } from './newRecords'
import { liveItems } from '@/domain'

/**
 * A day's worth of meals, copied from what the person usually eats.
 *
 * Every record carries `PATTERN_FILL` provenance — the meal AND each item
 * inside it. Marking only the meal would leave the items looking user-entered
 * to anything that reads an item on its own, and the nutrition screen does
 * exactly that.
 *
 * `confidence` is deliberately absent. It is documented as belonging to an AI
 * estimate, and a number here would be invented twice over: there is no model,
 * and no basis for saying a typical Tuesday is 0.7 likely.
 */
export function buildPatternFilledDay(
  userId: UserId,
  typical: TypicalDay,
  day: CalendarDate,
  zone = deviceZone(),
): Meal[] {
  const recordedAt = new Date().toISOString()

  return typical.meals.map(({ slot, template }) => {
    const mealId = asId<'Meal'>(newId()) as MealId
    /*
      Timed at the hour the original was eaten, on the new day.

      Not midday for everything: a breakfast stamped 12:00 sorts after lunch
      and reads as nonsense in a day view. `instantOn` puts a past day at
      midday local; this keeps the shape of the day it is copying.
    */
    const at = template.time.kind === 'instant'
      ? `${day}T${template.time.at.slice(11)}`
      : instantOn(day, zone)

    /*
      Only the items that are still current.

      A template can carry a correction chain — "170 g" superseded by "190 g" —
      and copying the whole list would resurrect the number the person already
      replaced. `liveItems` is the same resolver the rest of the app reads
      through, so the copy sees what a screen would show.
    */
    const items: FoodItem[] = liveItems(template.items).map((item) => ({
      ...item,
      id: asId<'FoodItem'>(newId()) as FoodItemId,
      mealId,
      // A fresh record, not a correction of the one it was copied from.
      provenance: { source: 'PATTERN_FILL' as const, kind: 'DERIVED' as const, recordedAt },
    }))

    return {
      id: mealId,
      recordId: newId(),
      version: 1,
      userId,
      slot,
      time: { kind: 'instant' as const, at, zone },
      items,
      provenance: { source: 'PATTERN_FILL' as const, kind: 'DERIVED' as const, recordedAt },
    }
  })
}
