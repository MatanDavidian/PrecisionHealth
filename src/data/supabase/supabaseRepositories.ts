/**
 * Supabase implementation of the repository interfaces (slice 3).
 *
 * The same contract the IndexedDB adapter implements, so no screen knows which
 * one it is talking to (D3). Rows carry the domain object in `data` exactly as
 * the client built it, with only the indexed columns lifted out — the same
 * envelope idea as the IndexedDB rows, which is what lets the two adapters
 * round-trip identical objects.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  asMealRecord,
  type AIInference,
  type CalendarDate,
  type Goal,
  type Meal,
  type Observation,
  type ObservationCode,
  type Sleep,
  type UserId,
  type UserProfile,
  type Workout,
} from '@/domain'
import { dayKeyOf } from '@/domain'
import type {
  DateRange,
  HealthRepositories,
  SettingsRepository,
} from '@/data/repositories'

/** Postgres unique violation — for meals, this IS the D15 conflict signal. */
const UNIQUE_VIOLATION = '23505'

export class MealVersionConflictError extends Error {
  constructor(readonly mealId: string, readonly version: number) {
    super(`Version ${version} of meal ${mealId} was already written by another device`)
    this.name = 'MealVersionConflictError'
  }
}

interface Row<T> {
  data: T
}

const rowsOf = <T>(rows: Row<T>[] | null): T[] => (rows ?? []).map((row) => row.data)

/** Supabase reports failures in the payload; the app expects them thrown. */
function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

export function createSupabaseRepositories(
  client: SupabaseClient,
  /**
   * Settings never leave the device (D14, Q8) — the API key in particular — so
   * this adapter delegates them to local storage rather than pretending to
   * sync them. Passing it in makes that explicit at the composition root.
   */
  localSettings: SettingsRepository,
): HealthRepositories {
  /** Rows for one day, for the plain `{id, user_id, day, data}` tables. */
  const listByDay = async <T>(table: string, userId: UserId, day: CalendarDate): Promise<T[]> =>
    rowsOf<T>(
      unwrap(await client.from(table).select('data').eq('user_id', userId).eq('day', day)),
    )

  const listByRange = async <T>(table: string, userId: UserId, range: DateRange): Promise<T[]> =>
    rowsOf<T>(
      unwrap(
        await client
          .from(table)
          .select('data')
          .eq('user_id', userId)
          .gte('day', range.from)
          .lte('day', range.to),
      ),
    )

  const insert = async (table: string, row: Record<string, unknown>): Promise<void> => {
    const { error } = await client.from(table).insert(row)
    if (error) throw new Error(error.message)
  }

  return {
    profiles: {
      get: async (userId) => {
        const { data, error } = await client
          .from('profiles')
          .select('data')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        return (data as Row<UserProfile> | null)?.data
      },
    },

    meals: {
      // Every version for the day; the domain picks the winner (D15).
      listByDay: async (userId, day) =>
        (await listByDay<Meal>('meals', userId, day)).map((meal) => asMealRecord(meal)),
      listByRange: async (userId, range) =>
        (await listByRange<Meal>('meals', userId, range)).map((meal) => asMealRecord(meal)),
      add: async (meal: Meal) => {
        const { error } = await client.from('meals').insert({
          record_id: meal.recordId,
          meal_id: meal.id,
          version: meal.version,
          user_id: meal.userId,
          day: dayKeyOf(meal.time),
          data: meal,
        })
        if (!error) return
        // Another device already claimed this version. Not a failure — the
        // signal that the two need reconciling (D15).
        if (error.code === UNIQUE_VIOLATION) {
          throw new MealVersionConflictError(meal.id, meal.version)
        }
        throw new Error(error.message)
      },
    },

    workouts: {
      listByDay: (userId, day) => listByDay<Workout>('workouts', userId, day),
      listByRange: (userId, range) => listByRange<Workout>('workouts', userId, range),
      add: (workout: Workout) =>
        insert('workouts', {
          id: workout.id,
          user_id: workout.userId,
          day: dayKeyOf(workout.time),
          data: workout,
        }),
    },

    sleep: {
      // Anchored to the wake day, exactly as the local store does.
      forDay: (userId, day) => listByDay<Sleep>('sleep', userId, day),
    },

    observations: {
      listByDay: async (userId, day, code?: ObservationCode) => {
        let query = client.from('observations').select('data').eq('user_id', userId).eq('day', day)
        if (code) query = query.eq('code', code)
        return rowsOf<Observation>(unwrap(await query))
      },
      latest: async (userId, code) => {
        // Newest day first, then every candidate from that day — the caller
        // resolves precedence (D5), so we must not narrow it to one record.
        const rows = unwrap(
          await client
            .from('observations')
            .select('data, day')
            .eq('user_id', userId)
            .eq('code', code)
            .order('day', { ascending: false })
            .limit(50),
        ) as (Row<Observation> & { day: CalendarDate })[] | null

        if (!rows || rows.length === 0) return []
        const mostRecentDay = rows[0].day
        return rows.filter((row) => row.day === mostRecentDay).map((row) => row.data)
      },
      add: (observation: Observation) =>
        insert('observations', {
          id: observation.id,
          user_id: observation.userId,
          day: dayKeyOf(observation.time),
          code: observation.code,
          data: observation,
        }),
    },

    goals: {
      listActive: async (userId) => {
        // `active` lives inside the payload; filtering on it server-side keeps
        // the round trip small without needing a column for it yet.
        const rows = unwrap(
          await client
            .from('goals')
            .select('data')
            .eq('user_id', userId)
            .eq('data->>active', 'true'),
        ) as Row<Goal>[] | null
        return rowsOf(rows)
      },
      add: (goal: Goal) =>
        insert('goals', {
          id: goal.id,
          user_id: goal.userId,
          day: goal.startsOn,
          data: goal,
        }),
    },

    inferences: {
      add: (inference: AIInference) =>
        insert('inferences', {
          id: inference.id,
          user_id: inference.userId,
          day: inference.createdAt.slice(0, 10),
          data: inference,
        }),
      listByDay: (userId, day) => listByDay<AIInference>('inferences', userId, day),
      get: async (id) => {
        const { data, error } = await client
          .from('inferences')
          .select('data')
          .eq('id', id)
          .maybeSingle()
        if (error) throw new Error(error.message)
        return (data as Row<AIInference> | null)?.data
      },
    },

    /** The one repository that is identical in both adapters — see above. */
    settings: localSettings,

    /** Clinical tables arrive with the slice that reads them. */
    clinical: {
      listPanels: async () => [],
      listConditions: async () => [],
      listRegimens: async () => [],
      listIntakeEvents: async () => [],
    },
  }
}
