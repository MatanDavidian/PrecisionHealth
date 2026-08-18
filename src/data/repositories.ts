/**
 * Phase 2 — repository interfaces.
 *
 * The UI talks to these, never to a concrete store. Today they are backed by
 * in-memory mock data; later the same interfaces are implemented against the
 * REST API without a single screen changing.
 *
 * All methods are async on purpose — a synchronous mock that later becomes a
 * network call would force a rewrite of every caller.
 */
import type {
  CalendarDate,
  Goal,
  Meal,
  Measurement,
  MeasurementCode,
  Observation,
  ObservationCode,
  Sleep,
  UserId,
  UserProfile,
  Workout,
} from '@/domain'

export interface DateRange {
  from: CalendarDate
  to: CalendarDate
}

export interface ProfileRepository {
  get(userId: UserId): Promise<UserProfile | undefined>
}

export interface MealRepository {
  listByDate(userId: UserId, date: CalendarDate): Promise<Meal[]>
  listByRange(userId: UserId, range: DateRange): Promise<Meal[]>
}

export interface WorkoutRepository {
  listByDate(userId: UserId, date: CalendarDate): Promise<Workout[]>
  listByRange(userId: UserId, range: DateRange): Promise<Workout[]>
}

export interface SleepRepository {
  latest(userId: UserId): Promise<Sleep | undefined>
  listByRange(userId: UserId, range: DateRange): Promise<Sleep[]>
}

export interface ObservationRepository {
  latest(userId: UserId, code: ObservationCode): Promise<Observation | undefined>
  listByDate(userId: UserId, date: CalendarDate): Promise<Observation[]>
}

export interface MeasurementRepository {
  latest(userId: UserId, code: MeasurementCode): Promise<Measurement | undefined>
  listByRange(userId: UserId, code: MeasurementCode, range: DateRange): Promise<Measurement[]>
}

export interface GoalRepository {
  listActive(userId: UserId): Promise<Goal[]>
}

/** Single entry point the UI depends on. */
export interface HealthRepositories {
  profiles: ProfileRepository
  meals: MealRepository
  workouts: WorkoutRepository
  sleep: SleepRepository
  observations: ObservationRepository
  measurements: MeasurementRepository
  goals: GoalRepository
}
