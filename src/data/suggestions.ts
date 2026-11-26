/**
 * Gathering what a "what to eat now?" request needs (meal-suggestions.md).
 *
 * The rules are in `domain/suggestions.ts`; this only reads: the meals (the
 * same window the usual meals use, so what the model is told you usually eat
 * is what the Again tab offers you), the week against its targets, and the
 * food preferences saved in Settings.
 */
import {
  addDays,
  buildSuggestionRequest,
  cleanFoodPreferences,
  dayKey,
  latestVersions,
  liveItems,
  mealsToCome,
  timeOfDay,
  weekSoFar,
  weekStartOf,
  type DailyTargets,
  type Macros,
  type Meal,
  type MealSlot,
  type MealToCome,
  type SuggestionRequest,
  type UserId,
  type WeekSoFar,
  isPatternFilled,
} from '@/domain'
import { getRepositories } from '.'
import { deviceZone, suggestSlot } from './newRecords'
import { USUALS_WINDOW_DAYS } from './usuals'
import { readTargetsHistory } from './targets'

const instantOf = (meal: Meal): string | undefined =>
  meal.time.kind === 'instant' ? meal.time.at : meal.time.kind === 'interval' ? meal.time.start : undefined

const hhmm = (at: Date) => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

const mealKcal = (meal: Meal) => liveItems(meal.items).reduce((sum, item) => sum + item.nutrients.energy.value, 0)

/**
 * The week so far, Sunday to now: each day before today against its own
 * targets and what it really burned, and today against its targets.
 */
export async function readWeekSoFar(
  userId: UserId,
  targets: DailyTargets,
  eaten: Macros,
  now: Date = new Date(),
): Promise<WeekSoFar> {
  const today = dayKey(now.toISOString(), deviceZone())
  const start = weekStartOf(today)
  const before =
    start < today ? await readTargetsHistory(userId, start, addDays(today, -1), getRepositories()) : []
  return weekSoFar(
    before.map((day) => ({ eaten: day.eaten, targets: day.targets, burnedKcal: day.burnedKcal })),
    { eaten, targets },
  )
}

/** The last two months of meals, newest versions, and today's among them. */
async function readHistory(userId: UserId, now: Date) {
  const zone = deviceZone()
  const today = dayKey(now.toISOString(), zone)
  const history = latestVersions(
    await getRepositories().meals.listByRange(userId, { from: addDays(today, -USUALS_WINDOW_DAYS), to: today }),
  ).filter((meal) => !meal.retracted)
  const dayOf = (meal: Meal) => {
    if (meal.time.kind === 'daily') return meal.time.date
    const at = instantOf(meal)
    return at ? dayKey(at, zone) : undefined
  }
  const todays = history.filter((meal) => dayOf(meal) === today)
  return { history, todays, dayOf, today, zone }
}

/**
 * The usual meals still to come today: their room is kept, and while one is
 * to come, what is suggested now is a snack, not that meal.
 */
export async function readMealsToCome(userId: UserId, now: Date = new Date()): Promise<MealToCome[]> {
  const { history, todays, dayOf, today, zone } = await readHistory(userId, now)
  const past = history.flatMap((meal) => {
    const day = dayOf(meal)
    if (!day || day === today || isPatternFilled(meal) || meal.time.kind !== 'instant') return []
    return [{ day, slot: meal.slot, time: timeOfDay(meal, zone), kcal: mealKcal(meal) }]
  })
  const eatenSlots: MealSlot[] = todays.filter((meal) => !isPatternFilled(meal)).map((meal) => meal.slot)
  return mealsToCome(past, eatenSlots, hhmm(now))
}

export async function readSuggestionRequest(
  userId: UserId,
  targets: DailyTargets,
  eaten: Macros,
  options: {
    note?: string
    avoid?: readonly string[]
    now?: Date
    plan?: { kind: 'FILL' | 'PROTEIN'; maxKcal: number }
    week?: WeekSoFar
    toCome?: readonly MealToCome[]
    training?: SuggestionRequest['trainingToday']
  } = {},
): Promise<SuggestionRequest> {
  const now = options.now ?? new Date()
  const [{ history, todays }, profile] = await Promise.all([
    readHistory(userId, now),
    getRepositories().profiles.get(userId).catch(() => undefined),
  ])
  return buildSuggestionRequest({
    slot: slotFor(now, options.toCome),
    localTime: hhmm(now),
    targets,
    eaten,
    history,
    today: todays,
    note: options.note,
    avoid: options.avoid,
    plan: options.plan,
    week: options.week,
    toCome: options.toCome,
    training: options.training,
    preferences: cleanFoodPreferences(profile?.foodPreferences),
  })
}

/** While a usual meal is still to come, what is eaten now is a snack, not that meal. */
export const slotFor = (now: Date, toCome: readonly MealToCome[] = []): MealSlot =>
  toCome.length > 0 ? 'SNACK' : suggestSlot(now)
