/**
 * IndexedDB implementation of the repository interfaces (slice 1).
 *
 * Replaces the in-memory mock without a single screen changing — the claim D3
 * makes. The only edit outside this directory was one line in
 * `src/data/index.ts`.
 */
import type { IDBPDatabase } from 'idb'
import type {
  CalendarDate,
  Goal,
  Meal,
  Observation,
  ObservationCode,
  Sleep,
  UserId,
  UserProfile,
  Workout,
} from '@/domain'
import type { DateRange, HealthRepositories } from '@/data/repositories'
import {
  mealRow,
  observationRow,
  openHealthDB,
  sleepRow,
  workoutRow,
  type HealthDB,
  type Row,
} from './schema'

const unwrap = <T>(rows: Row<T>[]): T[] => rows.map((row) => row.data)

/** IndexedDB has no "between" on a compound key without a range; build one. */
const dayRange = (userId: string, range: DateRange) =>
  IDBKeyRange.bound([userId, range.from], [userId, range.to])

const exactDay = (userId: string, day: CalendarDate) => IDBKeyRange.only([userId, day])

export function createIndexedDbRepositories(
  dbPromise: Promise<IDBPDatabase<HealthDB>> = openHealthDB(),
): HealthRepositories {
  const db = () => dbPromise

  return {
    profiles: {
      get: async (userId) => (await db()).get('profiles', userId),
    },

    meals: {
      listByDay: async (userId, day) =>
        unwrap(await (await db()).getAllFromIndex('meals', 'by-user-day', exactDay(userId, day))),
      listByRange: async (userId, range) =>
        unwrap(await (await db()).getAllFromIndex('meals', 'by-user-day', dayRange(userId, range))),
      add: async (meal: Meal) => {
        await (await db()).put('meals', mealRow(meal))
      },
    },

    workouts: {
      listByDay: async (userId, day) =>
        unwrap(await (await db()).getAllFromIndex('workouts', 'by-user-day', exactDay(userId, day))),
      listByRange: async (userId, range) =>
        unwrap(
          await (await db()).getAllFromIndex('workouts', 'by-user-day', dayRange(userId, range)),
        ),
      add: async (workout: Workout) => {
        await (await db()).put('workouts', workoutRow(workout))
      },
    },

    sleep: {
      forDay: async (userId, day) =>
        unwrap(await (await db()).getAllFromIndex('sleep', 'by-user-day', exactDay(userId, day))),
    },

    observations: {
      listByDay: async (userId, day, code?: ObservationCode) => {
        const rows = await (
          await db()
        ).getAllFromIndex('observations', 'by-user-day', exactDay(userId, day))
        const filtered = code ? rows.filter((row) => row.code === code) : rows
        return unwrap(filtered)
      },
      latest: async (userId, code) => {
        const rows = await (
          await db()
        ).getAllFromIndex('observations', 'by-user-code', IDBKeyRange.only([userId, code]))
        if (rows.length === 0) return []
        // All candidates from the most recent day that has any — the caller
        // resolves precedence, so we must not pre-filter to one record.
        const mostRecentDay = rows.map((row) => row.day).sort().at(-1)
        return unwrap(rows.filter((row) => row.day === mostRecentDay))
      },
      add: async (observation: Observation) => {
        await (await db()).put('observations', observationRow(observation))
      },
    },

    goals: {
      listActive: async (userId: UserId) => {
        const rows = await (await db()).getAll('goals')
        return unwrap(rows.filter((row) => row.userId === userId && row.data.active))
      },
    },

    clinical: {
      listPanels: async (userId) =>
        unwrap((await (await db()).getAll('labPanels')).filter((r) => r.userId === userId)),
      listConditions: async (userId) =>
        unwrap((await (await db()).getAll('conditions')).filter((r) => r.userId === userId)),
      listRegimens: async (userId) =>
        unwrap((await (await db()).getAll('regimens')).filter((r) => r.userId === userId)),
      listIntakeEvents: async (userId, range) =>
        unwrap(
          await (await db()).getAllFromIndex(
            'intakeEvents',
            'by-user-day',
            dayRange(userId, range),
          ),
        ),
    },
  }
}

/**
 * Writes the seed day the first time the app runs, so a new install has
 * something to look at. Guarded by a meta flag rather than by "is the store
 * empty", so deleting every meal does not resurrect the sample data.
 */
export interface SeedData {
  profile: UserProfile
  meals: Meal[]
  workouts: Workout[]
  sleep: Sleep[]
  observations: Observation[]
  goals: Goal[]
}

export async function seedOnce(
  dbPromise: Promise<IDBPDatabase<HealthDB>>,
  seed: SeedData,
): Promise<boolean> {
  const db = await dbPromise
  const already = await db.get('meta', 'seeded')
  if (already) return false

  const tx = db.transaction(
    ['profiles', 'meals', 'workouts', 'sleep', 'observations', 'goals', 'meta'],
    'readwrite',
  )
  await tx.objectStore('profiles').put(seed.profile)
  for (const meal of seed.meals) await tx.objectStore('meals').put(mealRow(meal))
  for (const workout of seed.workouts) await tx.objectStore('workouts').put(workoutRow(workout))
  for (const sleep of seed.sleep) await tx.objectStore('sleep').put(sleepRow(sleep))
  for (const observation of seed.observations) {
    await tx.objectStore('observations').put(observationRow(observation))
  }
  for (const goal of seed.goals) {
    await tx.objectStore('goals').put({
      id: goal.id,
      userId: goal.userId,
      day: goal.startsOn,
      data: goal,
    })
  }
  await tx.objectStore('meta').put({ key: 'seeded', value: new Date().toISOString() })
  await tx.done
  return true
}
