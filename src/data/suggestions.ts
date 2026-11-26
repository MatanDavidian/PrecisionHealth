/**
 * Gathering what a "what to eat now?" request needs (meal-suggestions.md).
 *
 * The rules are in `domain/suggestions.ts`; this only reads the meals: the
 * same window the usual meals use, so what the model is told you usually eat
 * is what the Again tab offers you.
 */
import {
  addDays,
  buildSuggestionRequest,
  dayKey,
  latestVersions,
  type DailyTargets,
  type Macros,
  type Meal,
  type SuggestionRequest,
  type UserId,
} from '@/domain'
import { getRepositories } from '.'
import { deviceZone, suggestSlot } from './newRecords'
import { USUALS_WINDOW_DAYS } from './usuals'

const instantOf = (meal: Meal): string | undefined =>
  meal.time.kind === 'instant' ? meal.time.at : meal.time.kind === 'interval' ? meal.time.start : undefined

const hhmm = (at: Date) => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

export async function readSuggestionRequest(
  userId: UserId,
  targets: DailyTargets,
  eaten: Macros,
  options: { note?: string; avoid?: readonly string[]; now?: Date } = {},
): Promise<SuggestionRequest> {
  const now = options.now ?? new Date()
  const zone = deviceZone()
  const today = dayKey(now.toISOString(), zone)
  const history = latestVersions(
    await getRepositories().meals.listByRange(userId, { from: addDays(today, -USUALS_WINDOW_DAYS), to: today }),
  )
  const todays = history.filter((meal) => {
    const at = instantOf(meal)
    return meal.time.kind === 'daily' ? meal.time.date === today : at ? dayKey(at, zone) === today : false
  })
  return buildSuggestionRequest({
    slot: suggestSlot(now),
    localTime: hhmm(now),
    targets,
    eaten,
    history,
    today: todays,
    note: options.note,
    avoid: options.avoid,
  })
}
