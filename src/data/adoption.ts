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
import {
  addDays,
  dayKey,
  type CalendarDate,
  type Goal,
  type Meal,
  type Observation,
  type ProfileDetail,
  type UserId,
  type UserProfile,
} from '@/domain'
import { deviceZone } from './newRecords'
import type { HealthRepositories } from './repositories'

/** A generated id, as opposed to a hand-written one in the seed data. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isGeneratedId = (id: string): boolean => UUID.test(id)

export interface AdoptableRecords {
  meals: Meal[]
  observations: Observation[]
  /** Goals the person chose here: the programme, a target weight, their own numbers. */
  goals: Goal[]
  /** The profile details the person set themselves (`youSet`), never the sample's. */
  details: Partial<Pick<UserProfile, ProfileDetail>>
  days: CalendarDate[]
}

/** How many things a set of records amounts to, for "Move 12 records". */
export const adoptableCount = (records: AdoptableRecords): number =>
  records.meals.length +
  records.observations.length +
  records.goals.length +
  (Object.keys(records.details).length > 0 ? 1 : 0)

export interface AdoptionResult {
  meals: number
  observations: number
  goals: number
  /** Profile details written into the account, which had none of its own for them. */
  details: number
  /** Records already present in the account, skipped rather than duplicated. */
  skipped: number
}

/** How far back to look. A year of days is a cheap scan locally and plenty. */
const LOOKBACK_DAYS = 400

/**
 * The user's own days, not UTC's.
 *
 * Records are filed under the local calendar day (D7), so a range built from
 * `toISOString()` is a different calendar east of Greenwich: between midnight
 * and the UTC offset, "today" locally is still tomorrow in UTC and the most
 * recent day falls outside the window entirely. Someone signing in at 00:30
 * would have silently left that day behind.
 */
const daysEndingToday = (count: number): CalendarDate[] => {
  const zone = deviceZone()
  const today = dayKey(new Date().toISOString(), zone)
  const days: CalendarDate[] = []
  for (let i = 0; i < count; i += 1) days.push(addDays(today, -i))
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

  // Goals by the same id rule: the sample's are hand-written ('goal-objective').
  const goals = (await local.goals.listActive(localUserId)).filter((goal) => isGeneratedId(goal.id))
  const profile = await local.profiles.get(localUserId).catch(() => undefined)
  const details: AdoptableRecords['details'] = {}
  for (const detail of profile?.youSet ?? []) {
    if (profile?.[detail] !== undefined) Object.assign(details, { [detail]: profile[detail] })
  }

  const days = [
    ...new Set([...meals.map((m) => m.time), ...observations.map((o) => o.time)].map((time) =>
      time.kind === 'daily' ? time.date : time.kind === 'interval' ? time.start.slice(0, 10) : time.at.slice(0, 10),
    )),
  ].sort()

  return { meals, observations, goals, details, days: days as CalendarDate[] }
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
  const result: AdoptionResult = { meals: 0, observations: 0, goals: 0, details: 0, skipped: 0 }

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
  /*
    Goals are append-only like the rest (D4): the newest one per metric is the
    one in force, so a goal chosen here before signing in sits in the
    account's history in its place, and a later one in the account still wins.
  */
  for (const goal of records.goals) {
    try {
      await remote.goals.add({ ...goal, userId: accountUserId })
      result.goals += 1
    } catch {
      result.skipped += 1
    }
  }
  /*
    The profile is one record, not a history, so it is merged rather than
    added: a detail the account already holds (from another device, say)
    stays as it is, and only the gaps are filled from here.
  */
  const detailNames = Object.keys(records.details) as ProfileDetail[]
  if (detailNames.length > 0) {
    const existing = await remote.profiles.get(accountUserId).catch(() => undefined)
    const missing = detailNames.filter((detail) => existing?.[detail] === undefined)
    if (missing.length > 0) {
      const base: UserProfile = existing ?? {
        userId: accountUserId,
        displayName: '',
        timezone: deviceZone(),
        preferredMassUnit: 'kg',
        preferredLengthUnit: 'cm',
      }
      const merged: UserProfile = { ...base, userId: accountUserId }
      for (const detail of missing) Object.assign(merged, { [detail]: records.details[detail] })
      merged.youSet = [...new Set([...(base.youSet ?? []), ...missing])]
      await remote.profiles.save(merged)
      result.details = missing.length
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
