/**
 * In-memory implementation of the repository interfaces, backed by the seed
 * dataset. Swapping this for a REST-backed implementation is the only change
 * needed when the backend lands (roadmap phase 6).
 */
import type { CalendarDate, MeasurementCode, ObservationCode, UserId } from '@/domain'
import type { DateRange, HealthRepositories } from '@/data/repositories'
import { goals, meals, measurements, observations, profile, sleep, workouts } from './seed'

/** Pretend latency so loading states are real from the start. */
const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), 120))

const dateOf = (time: { kind: string; at?: string; start?: string; date?: string }): CalendarDate => {
  if (time.kind === 'daily') return time.date as CalendarDate
  const iso = time.kind === 'interval' ? time.start! : time.at!
  return iso.slice(0, 10)
}

const inRange = (date: CalendarDate, range: DateRange) => date >= range.from && date <= range.to

export const inMemoryRepositories: HealthRepositories = {
  profiles: {
    get: async (userId: UserId) => delay(profile.userId === userId ? profile : undefined),
  },
  meals: {
    listByDate: async (_userId, date) => delay(meals.filter((m) => dateOf(m.time) === date)),
    listByRange: async (_userId, range) => delay(meals.filter((m) => inRange(dateOf(m.time), range))),
  },
  workouts: {
    listByDate: async (_userId, date) => delay(workouts.filter((w) => dateOf(w.time) === date)),
    listByRange: async (_userId, range) =>
      delay(workouts.filter((w) => inRange(dateOf(w.time), range))),
  },
  sleep: {
    latest: async () => delay(sleep),
    listByRange: async (_userId, range) => delay([sleep].filter((s) => inRange(dateOf(s.time), range))),
  },
  observations: {
    latest: async (_userId, code: ObservationCode) =>
      delay(observations.find((o) => o.code === code)),
    listByDate: async (_userId, date) => delay(observations.filter((o) => dateOf(o.time) === date)),
  },
  measurements: {
    latest: async (_userId, code: MeasurementCode) =>
      delay(measurements.find((m) => m.code === code)),
    listByRange: async (_userId, code, range) =>
      delay(measurements.filter((m) => m.code === code && inRange(dateOf(m.time), range))),
  },
  goals: {
    listActive: async () => delay(goals.filter((g) => g.active)),
  },
}
