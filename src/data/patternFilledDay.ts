/**
 * Turning a typical day into a record for a day that was left blank.
 *
 * The arithmetic lives in `@/domain/patternFill`; this is the part that writes,
 * and it exists separately for the same reason `estimatedMeal.ts` does — the
 * domain does not know about ids, clocks or repositories.
 */
import { instantOn, newId, deviceZone } from './newRecords'
import {
  asId,
  canonical,
  type CalendarDate,
  type FoodItemId,
  type Meal,
  type MealId,
  type TypicalIntake,
  type UserId,
} from '@/domain'

/**
 * What the record calls itself where no screen is translating it.
 *
 * Screens never show this — they recognise the record by its provenance and
 * say "Estimated day" in the reader's language. It exists for the export and
 * for the insights model, which read names, and should read one that cannot
 * be mistaken for food.
 */
export const ESTIMATED_DAY_NAME = 'Estimated day (average of logged days)'

/**
 * One record carrying a day's average, and nothing that looks like a meal.
 *
 * Stored as a meal with a single item because that is the shape every total
 * already sums — the week bars, the day's calories, the export, Undo. A new
 * record type would have needed teaching to each of them, and the one that
 * was missed would have read the day as zero again.
 *
 * The slot is a placeholder and nothing displays it: every screen that lists
 * meals renders a filled record as the estimate it is. Lunch because it is
 * stamped at midday, and a record whose time and slot disagree invites
 * somebody to "fix" one of them.
 *
 * The amount is zero grams. A day does not weigh anything, and any number
 * here would be invented; zero is also what stops a portion editor from
 * scaling it, since there is nothing to scale from.
 *
 * `confidence` is deliberately absent. It is documented as belonging to an AI
 * estimate, and a number here would be invented twice over: there is no model,
 * and no basis for saying a typical Tuesday is 0.7 likely.
 */
export function buildPatternFilledDay(
  userId: UserId,
  typical: TypicalIntake,
  day: CalendarDate,
  zone = deviceZone(),
): Meal {
  const recordedAt = new Date().toISOString()
  const provenance = { source: 'PATTERN_FILL' as const, kind: 'DERIVED' as const, recordedAt }
  const mealId = asId<'Meal'>(newId()) as MealId

  return {
    id: mealId,
    recordId: newId(),
    version: 1,
    userId,
    slot: 'LUNCH',
    time: { kind: 'instant', at: instantOn(day, zone), zone },
    items: [
      {
        id: asId<'FoodItem'>(newId()) as FoodItemId,
        mealId,
        name: ESTIMATED_DAY_NAME,
        amount: canonical(0, 'g'),
        nutrients: {
          energy: canonical(Math.round(typical.energyKcal), 'kcal'),
          protein: canonical(Math.round(typical.proteinG), 'g'),
          carbs: canonical(Math.round(typical.carbsG), 'g'),
          fat: canonical(Math.round(typical.fatG), 'g'),
        },
        // Marked on the item too: the nutrition screen reads items on their
        // own, and an unmarked item would look user-entered to it.
        provenance,
      },
    ],
    provenance,
  }
}
