/**
 * Moving this browser's data into a freshly signed-in account (slice 3, step 4).
 *
 * The one-time bridge from local to cloud. Signing in otherwise hands you an
 * empty account while everything you have logged sits in a browser you might
 * clear tomorrow.
 *
 * The rule that decides what moves is the whole design: **only records the
 * user actually created**. Seeded sample records carry fixed, readable ids
 * (`meal-breakfast`, `obs-hrv`) while everything real gets a UUID from
 * `crypto.randomUUID()`. That difference — free, already there, needing no
 * flag — is what keeps the demo day out of your account (Q5).
 */
import type { CalendarDate, Meal, Observation, UserId } from '@/domain'
import type { HealthRepositories } from './repositories'

/** A generated id, as opposed to a hand-written one in the seed data. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isGeneratedId = (id: string): boolean => UUID.test(id)

export interface AdoptableRecords {
  meals: Meal[]
  observations: Observation[]
  days: CalendarDate[]
}

export interface AdoptionResult {
  meals: number
  observations: number
  /** Records already present in the account, skipped rather than duplicated. */
  skipped: number
}

/** How far back to look. A year of days is a cheap scan locally and plenty. */
const LOOKBACK_DAYS = 400

const daysEndingToday = (count: number): CalendarDate[] => {
  const days: CalendarDate[] = []
  const cursor = new Date()
  for (let i = 0; i < count; i += 1) {
    days.push(cursor.toISOString().slice(0, 10) as CalendarDate)
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return days
}

/**
 * What this browser holds that belongs in an account.
 *
 * Meals are judged by their MEAL id rather than their record id: a correction
 * to a seeded meal has a generated record id but belongs to the demo day, and
 * lifting it alone would put a version 2 into the account with no version 1
 * beneath it.
 */
export async function findAdoptableRecords(
  local: HealthRepositories,
  localUserId: UserId,
): Promise<AdoptableRecords> {
  const range = daysEndingToday(LOOKBACK_DAYS)
  const from = range[range.length - 1]
  const to = range[0]

  const meals = (await local.meals.listByRange(localUserId, { from, to })).filter((meal) =>
    isGeneratedId(meal.id),
  )

  const observations: Observation[] = []
  for (const day of range) {
    const forDay = await local.observations.listByDay(localUserId, day)
    observations.push(...forDay.filter((observation) => isGeneratedId(observation.id)))
  }

  const days = [
    ...new Set([...meals.map((m) => m.time), ...observations.map((o) => o.time)].map((time) =>
      time.kind === 'daily' ? time.date : time.kind === 'interval' ? time.start.slice(0, 10) : time.at.slice(0, 10),
    )),
  ].sort()

  return { meals, observations, days: days as CalendarDate[] }
}

/**
 * Uploads them under the signed-in user's id.
 *
 * Idempotent by construction: a record already in the account fails its
 * primary key or its (meal_id, version) constraint, and that is counted as
 * "already there" rather than an error — so an interrupted adoption can simply
 * be run again.
 */
export async function adoptInto(
  remote: HealthRepositories,
  records: AdoptableRecords,
  accountUserId: UserId,
): Promise<AdoptionResult> {
  const result: AdoptionResult = { meals: 0, observations: 0, skipped: 0 }

  // Oldest first, so a meal's version 1 lands before its version 2.
  const meals = [...records.meals].sort((a, b) => a.version - b.version)

  for (const meal of meals) {
    try {
      await remote.meals.add({
        ...meal,
        userId: accountUserId,
        items: meal.items.map((item) => ({ ...item })),
      })
      result.meals += 1
    } catch {
      result.skipped += 1
    }
  }

  for (const observation of records.observations) {
    try {
      await remote.observations.add({ ...observation, userId: accountUserId })
      result.observations += 1
    } catch {
      result.skipped += 1
    }
  }

  return result
}

/**
 * Whether this account has already taken this browser's data.
 *
 * Device-local UI state rather than health data, so it lives in localStorage:
 * it exists only to stop the prompt reappearing on every visit, and losing it
 * costs nothing because adoption is idempotent.
 */
const adoptedKey = (userId: UserId) => `adopted-into:${userId}`

export const hasAdopted = (userId: UserId): boolean => {
  try {
    return localStorage.getItem(adoptedKey(userId)) !== null
  } catch {
    return false
  }
}

export const markAdopted = (userId: UserId): void => {
  try {
    localStorage.setItem(adoptedKey(userId), new Date().toISOString())
  } catch {
    // Private browsing. The prompt reappears; adoption stays idempotent.
  }
}
