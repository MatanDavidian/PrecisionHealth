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
  dayAnswers,
  dayKey,
  findUsualMeals,
  missingMeals,
  latestVersions,
  liveItems,
  mealsToCome,
  timeOfDay,
  weekSoFar,
  type DailyTargets,
  type Macros,
  type Meal,
  type MealSlot,
  type MealToCome,
  type DayAnswers,
  type PastMeal,
  type UsualMeal,
  type SuggestionRequest,
  type UserId,
  type WeekSoFar,
  isPatternFilled,
} from '@/domain'
import { getRepositories } from '.'
import { deviceZone, suggestSlot } from './newRecords'
import { USUALS_WINDOW_DAYS } from './usuals'
import { readTargetsHistory } from './targets'

/** The suggestion card's period: the last seven days, today included. */
export const PERIOD_DAYS = 7

const instantOf = (meal: Meal): string | undefined =>
  meal.time.kind === 'instant' ? meal.time.at : meal.time.kind === 'interval' ? meal.time.start : undefined

const hhmm = (at: Date) => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

const mealKcal = (meal: Meal) => liveItems(meal.items).reduce((sum, item) => sum + item.nutrients.energy.value, 0)

/**
 * The last seven days, today among them (meal-suggestions-precision.md
 * §5.1, Phase 2): each day before today against its own targets and what it
 * really burned, with what the person said about its log, and today against
 * its targets. Rolling rather than the calendar week, so Sunday is not a
 * blind spot and Saturday is not forgotten overnight; the week view keeps
 * calendar weeks, for reporting.
 */
export async function readWeekSoFar(
  userId: UserId,
  targets: DailyTargets,
  eaten: Macros,
  now: Date = new Date(),
): Promise<WeekSoFar> {
  const today = dayKey(now.toISOString(), deviceZone())
  const start = addDays(today, -(PERIOD_DAYS - 1))
  const repos = getRepositories()
  const [before, checks] = await Promise.all([
    start < today ? readTargetsHistory(userId, start, addDays(today, -1), repos) : Promise.resolve([]),
    repos.dayChecks.listByRange(userId, { from: start, to: today }).catch(() => []),
  ])
  const answers = dayAnswers(checks)
  // An approved correction from the weight trend applies to a day's recorded
  // burn as it does to the usual one (§5.4): it corrects the watch.
  const factor = (await repos.profiles.get(userId).catch(() => undefined))?.burnCalibration?.factor ?? 1
  return weekSoFar(
    before.map((day) => ({
      day: day.day,
      eaten: day.eaten,
      targets: day.targets,
      burnedKcal: day.burnedKcal === undefined ? undefined : day.burnedKcal * factor,
      // Food on the day, but no meal anyone logged: a day set in one tap.
      setInOneTap: !day.logged && day.eaten.energyKcal > 0,
      completeness: answers.get(day.day)?.completeness,
    })),
    { day: today, eaten, targets },
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

/** A usual meal that looks missing today, with the meal to add in one tap. */
export interface MissingMeal extends MealToCome {
  usual?: UsualMeal
}

/** What today looks like against the person's habits, and what they said about it. */
export interface TodayContext {
  /** Usual meals still to come: their room is kept, and what is suggested now is a snack. */
  toCome: MealToCome[]
  /** Usual meals past their time and not logged, nor said to be skipped: asked about first. */
  missing: MissingMeal[]
  /** What the person said about today: complete, and meals skipped. */
  answers: DayAnswers
  /** How many days had food on them in the last two months: few means no usual foods yet. */
  loggedDays: number
}

export async function readTodayContext(userId: UserId, now: Date = new Date()): Promise<TodayContext> {
  const { history, todays, dayOf, today, zone } = await readHistory(userId, now)
  const checks = await getRepositories()
    .dayChecks.listByRange(userId, { from: today, to: today })
    .catch(() => [])
  const answers = dayAnswers(checks).get(today) ?? { skipped: [] }
  const pastMeals = history.filter((meal) => {
    const day = dayOf(meal)
    return day && day !== today && !isPatternFilled(meal)
  })
  const past: PastMeal[] = pastMeals.flatMap((meal) => {
    if (meal.time.kind !== 'instant') return []
    return [{ day: dayOf(meal)!, slot: meal.slot, time: timeOfDay(meal, zone), kcal: mealKcal(meal) }]
  })
  const eatenSlots: MealSlot[] = todays.filter((meal) => !isPatternFilled(meal)).map((meal) => meal.slot)
  const missing = missingMeals(past, eatenSlots, hhmm(now), answers.skipped).map((meal) => ({
    ...meal,
    usual: findUsualMeals(pastMeals, { slot: meal.slot, limit: 1 })[0],
  }))
  return {
    toCome: mealsToCome(past, eatenSlots, hhmm(now)),
    missing,
    answers,
    loggedDays: new Set(past.map((meal) => meal.day)).size,
  }
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
    weightKg?: number
    minutesToBedtime?: number
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
    weightKg: options.weightKg,
    minutesToBedtime: options.minutesToBedtime,
  })
}

/** While a usual meal is still to come, what is eaten now is a snack, not that meal. */
export const slotFor = (now: Date, toCome: readonly MealToCome[] = []): MealSlot =>
  toCome.length > 0 ? 'SNACK' : suggestSlot(now)
