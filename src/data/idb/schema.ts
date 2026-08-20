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
}

export const DB_NAME = 'timeline-health'
export const DB_VERSION = 1

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
    upgrade(db) {
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
