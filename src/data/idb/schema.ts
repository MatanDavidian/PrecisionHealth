/**
 * IndexedDB schema.
 *
 * Records are stored in an envelope — `{ id, userId, day, data }` — rather than
 * as bare domain objects. Two reasons:
 *
 * 1. `day` is the derived local calendar day (D7), persisted so the store can
 *    index it. Deriving it at query time would mean scanning every record to
 *    answer "what did I eat today", and would put timezone logic inside the
 *    storage layer where the server would have to duplicate it.
 * 2. The domain object stays exactly as the domain defined it. Nothing is added
 *    to it to make persistence convenient, so the same object round-trips
 *    unchanged through IndexedDB today and HTTP later.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  dayKeyOf,
  type AIInference,
  type CalendarDate,
  type Condition,
  type Goal,
  type IntakeEvent,
  type LabPanel,
  type Meal,
  type Observation,
  type ObservationCode,
  type Regimen,
  type Sleep,
  type UserProfile,
  type Workout,
} from '@/domain'

export interface Row<T> {
  id: string
  userId: string
  day: CalendarDate
  data: T
}

/** Observations additionally index by code, for `latest(code)`. */
export interface ObservationRow extends Row<Observation> {
  code: ObservationCode
}

/** Key-value settings. Never synced — it holds the API key (D14, Q8). */
export interface SettingsRow {
  key: string
  value: string
}

export interface HealthDB extends DBSchema {
  meals: { key: string; value: Row<Meal>; indexes: { 'by-user-day': [string, string] } }
  workouts: { key: string; value: Row<Workout>; indexes: { 'by-user-day': [string, string] } }
  sleep: { key: string; value: Row<Sleep>; indexes: { 'by-user-day': [string, string] } }
  observations: {
    key: string
    value: ObservationRow
    indexes: { 'by-user-day': [string, string]; 'by-user-code': [string, string] }
  }
  goals: { key: string; value: Row<Goal>; indexes: { 'by-user-day': [string, string] } }
  profiles: { key: string; value: UserProfile }
  labPanels: { key: string; value: Row<LabPanel>; indexes: { 'by-user-day': [string, string] } }
  conditions: { key: string; value: Row<Condition>; indexes: { 'by-user-day': [string, string] } }
  regimens: { key: string; value: Row<Regimen>; indexes: { 'by-user-day': [string, string] } }
  intakeEvents: { key: string; value: Row<IntakeEvent>; indexes: { 'by-user-day': [string, string] } }
  meta: { key: string; value: { key: string; value: string } }
  /** AI audit trail (D4): one row per inference, successful or not. */
  inferences: { key: string; value: Row<AIInference>; indexes: { 'by-user-day': [string, string] } }
  settings: { key: string; value: SettingsRow }
}

export const DB_NAME = 'timeline-health'
/**
 * v1 — slice 1 stores.
 * v2 — slice 2 adds `inferences` and `settings`. Additive only: no existing
 *      row is rewritten, so the upgrade cannot corrupt slice-1 data. There is
 *      deliberately no store for photos (spec §3).
 */
export const DB_VERSION = 2

const DAY_INDEXED = [
  'meals',
  'workouts',
  'sleep',
  'observations',
  'goals',
  'labPanels',
  'conditions',
  'regimens',
  'intakeEvents',
] as const

export const openHealthDB = (): Promise<IDBPDatabase<HealthDB>> =>
  openDB<HealthDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        for (const name of DAY_INDEXED) {
          const store = db.createObjectStore(name, { keyPath: 'id' })
          store.createIndex('by-user-day', ['userId', 'day'])
          if (name === 'observations') {
            ;(store as unknown as { createIndex: (n: string, k: string[]) => void }).createIndex(
              'by-user-code',
              ['userId', 'code'],
            )
          }
        }
        db.createObjectStore('profiles', { keyPath: 'userId' })
        db.createObjectStore('meta', { keyPath: 'key' })
      }

      if (oldVersion < 2) {
        const inferences = db.createObjectStore('inferences', { keyPath: 'id' })
        inferences.createIndex('by-user-day', ['userId', 'day'])
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    },
  })

/** Sleep is anchored to the wake day; everything else to when it started. */
export const rowFor = <T extends { id: string; userId: string }>(
  data: T,
  day: CalendarDate,
): Row<T> => ({ id: data.id, userId: data.userId, day, data })

export const mealRow = (meal: Meal): Row<Meal> => rowFor(meal, dayKeyOf(meal.time))
export const workoutRow = (workout: Workout): Row<Workout> => rowFor(workout, dayKeyOf(workout.time))
export const sleepRow = (sleep: Sleep): Row<Sleep> => rowFor(sleep, dayKeyOf(sleep.time, 'END'))
export const observationRow = (observation: Observation): ObservationRow => ({
  ...rowFor(observation, dayKeyOf(observation.time)),
  code: observation.code,
})
