/**
 * IndexedDB implementation of the repository interfaces (slice 1).
 *
 * Replaces the in-memory mock without a single screen changing — the claim D3
 * makes. The only edit outside this directory was one line in
 * `src/data/index.ts`.
 */
import type { IDBPDatabase } from 'idb'
import type {
  AIInference,
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
import type { AppSettings, DateRange, HealthRepositories } from '@/data/repositories'
import { DEFAULT_SETTINGS } from '@/config'
import {
  asMeal,
  goalRow,
  mealRow,
  observationRow,
  openHealthDB,
  sleepRow,
  workoutRow,
  type HealthDB,
} from './schema'

/** Rows carry indexing columns; callers only ever want the domain object. */
const unwrap = <T>(rows: { data: T }[]): T[] => rows.map((row) => row.data)

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
      // Returns EVERY version for the day; the domain decides which one wins
      // and whether any of them disagree (D15) — the same division of labour
      // as observations.
      listByDay: async (userId, day) =>
        (await (await db()).getAllFromIndex('meals', 'by-user-day', exactDay(userId, day))).map(
          asMeal,
        ),
      listByRange: async (userId, range) =>
        (await (await db()).getAllFromIndex('meals', 'by-user-day', dayRange(userId, range))).map(
          asMeal,
        ),
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
      add: async (goal) => {
        await (await db()).put('goals', goalRow(goal))
      },
    },

    inferences: {
      add: async (inference: AIInference) => {
        await (await db()).put('inferences', {
          id: inference.id,
          userId: inference.userId,
          day: inference.createdAt.slice(0, 10),
          data: inference,
        })
      },
      listByDay: async (userId, day) =>
        unwrap(await (await db()).getAllFromIndex('inferences', 'by-user-day', exactDay(userId, day))),
      get: async (id: string) => (await (await db()).get('inferences', id))?.data,
    },

    settings: {
      get: async (): Promise<AppSettings> => {
        const rows = await (await db()).getAll('settings')
        const value = (key: string) => rows.find((row) => row.key === key)?.value
        return {
          ...DEFAULT_SETTINGS,
          apiKey: value('apiKey') || undefined,
          model: value('model') || DEFAULT_SETTINGS.model,
          autoAnalyze: value('autoAnalyze') !== 'false',
          trialModel: value('trialModel') || undefined,
          // Narrowed rather than cast: settings are strings on the way out, and
          // a stored value from a future build should fall back to "follow the
          // browser" rather than become an invalid language.
          language: value('language') === 'he' || value('language') === 'en'
            ? (value('language') as 'en' | 'he')
            : undefined,
        }
      },
      save: async (patch) => {
        const database = await db()
        const tx = database.transaction('settings', 'readwrite')
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined || value === '') {
            await tx.store.delete(key)
          } else {
            await tx.store.put({ key, value: String(value) })
          }
        }
        await tx.done
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

    account: {
      /*
        Whole stores, filtered by user — not a union of the day-scoped reads
        above. Those all take a window, and an export assembled from windows is
        one whose completeness depends on guessing the right dates. Reading
        everything and filtering cannot miss a record that exists.
      */
      everything: async (userId) => {
        const database = await db()
        const mine = <T extends { userId: string }>(rows: T[]) =>
          rows.filter((row) => row.userId === userId)

        return {
          profile: await database.get('profiles', userId),
          // Every version, deliberately. Versions are the history (D15), and
          // an export that kept only the winners would be a summary.
          meals: mine(await database.getAll('meals')).map(asMeal),
          workouts: unwrap(mine(await database.getAll('workouts'))),
          sleep: unwrap(mine(await database.getAll('sleep'))),
          observations: unwrap(mine(await database.getAll('observations'))),
          goals: unwrap(mine(await database.getAll('goals'))),
          labPanels: unwrap(mine(await database.getAll('labPanels'))),
          conditions: unwrap(mine(await database.getAll('conditions'))),
          regimens: unwrap(mine(await database.getAll('regimens'))),
          intakeEvents: unwrap(mine(await database.getAll('intakeEvents'))),
          inferences: unwrap(mine(await database.getAll('inferences'))),
        }
      },
    },
  }
}

/**
 * Erases every record belonging to one user from the local store.
 *
 * Standalone, beside `seedOnce`, rather than a method on the repositories:
 * this is not something the Supabase adapter has a sensible version of.
 * Deleting an ACCOUNT removes an auth user and lets Postgres cascade; this
 * clears a browser. Giving both one name on the interface would have made
 * them look like the same operation with two backends.
 */
export async function eraseLocalRecords(
  dbPromise: Promise<IDBPDatabase<HealthDB>>,
  userId: UserId,
): Promise<void> {
  const db = await dbPromise
  /*
    One transaction over every store, so a wipe cannot stop half way and leave
    a person's data partly erased with nothing to say which half.

    `settings` and `meta` are left alone on purpose: settings are this device's
    preferences and its API key rather than anyone's health data, and clearing
    `meta` would un-set the seeded flag — so the very last act of a deletion
    would be to write the sample day back in.
  */
  const tx = db.transaction(ERASABLE, 'readwrite')
  // The profile is keyed by the user, so it goes by key; everything else is
  // keyed by record id and has to be looked at to know whose it is.
  await tx.objectStore('profiles').delete(userId)
  await Promise.all(
    RECORD_STORES.map(async (name) => {
      const store = tx.objectStore(name)
      for (const row of await store.getAll()) {
        if (row.userId === userId) await store.delete(row.id)
      }
    }),
  )
  await tx.done
}

/** Stores of records that carry a `userId`, keyed by their own id. */
const RECORD_STORES = [
  'meals',
  'workouts',
  'sleep',
  'observations',
  'goals',
  'labPanels',
  'conditions',
  'regimens',
  'intakeEvents',
  'inferences',
] as const

/** Everything a deletion touches, profile included. */
const ERASABLE = ['profiles', ...RECORD_STORES] as const

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
