/**
 * In-memory implementation of the repository interfaces.
 *
 * This is the throwaway one. Slice 1 replaces it with IndexedDB and slice 2
 * with the API — neither of which changes a single screen, which is the whole
 * point of the seam.
 */
import { dayKeyOf, type CalendarDate, type Observation, type ObservationCode, type UserId } from '@/domain'
import type { DateRange, HealthRepositories } from '@/data/repositories'
import {
  conditions,
  goals,
  intakeEvents,
  labPanels,
  meals,
  observations,
  profile,
  regimens,
  sleep,
  workouts,
} from './seed'

/** Pretend latency, so loading states are real from the first commit. */
const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), 120))

const inRange = (day: CalendarDate, range: DateRange) => day >= range.from && day <= range.to

const mutableObservations = [...observations]
const mutableMeals = [...meals]
const mutableWorkouts = [...workouts]

export const inMemoryRepositories: HealthRepositories = {
  profiles: {
    get: async (userId: UserId) => delay(profile.userId === userId ? profile : undefined),
  },

  meals: {
    listByDay: async (_userId, day) => delay(mutableMeals.filter((m) => dayKeyOf(m.time) === day)),
    listByRange: async (_userId, range) =>
      delay(mutableMeals.filter((m) => inRange(dayKeyOf(m.time), range))),
    add: async (meal) => {
      mutableMeals.push(meal)
      return delay(undefined)
    },
  },

  workouts: {
    listByDay: async (_userId, day) => delay(mutableWorkouts.filter((w) => dayKeyOf(w.time) === day)),
    listByRange: async (_userId, range) =>
      delay(mutableWorkouts.filter((w) => inRange(dayKeyOf(w.time), range))),
    add: async (workout) => {
      mutableWorkouts.push(workout)
      return delay(undefined)
    },
  },

  sleep: {
    // Anchored to the wake day, not the day the user fell asleep.
    forDay: async (_userId, day) => delay(sleep.filter((s) => dayKeyOf(s.time, 'END') === day)),
  },

  observations: {
    listByDay: async (_userId, day, code?: ObservationCode) =>
      delay(
        mutableObservations.filter(
          (o) => dayKeyOf(o.time) === day && (code === undefined || o.code === code),
        ),
      ),
    latest: async (_userId, code) => {
      const matching = mutableObservations.filter((o) => o.code === code)
      if (matching.length === 0) return delay([] as Observation[])
      const mostRecentDay = matching
        .map((o) => dayKeyOf(o.time))
        .sort()
        .at(-1)
      return delay(matching.filter((o) => dayKeyOf(o.time) === mostRecentDay))
    },
    add: async (observation) => {
      mutableObservations.push(observation)
      return delay(undefined)
    },
  },

  goals: {
    listActive: async () => delay(goals.filter((g) => g.active)),
  },

  clinical: {
    listPanels: async () => delay(labPanels),
    listConditions: async () => delay(conditions),
    listRegimens: async () => delay(regimens),
    listIntakeEvents: async (_userId, range) =>
      delay(intakeEvents.filter((e) => inRange(e.takenAt.slice(0, 10), range))),
  },
}
