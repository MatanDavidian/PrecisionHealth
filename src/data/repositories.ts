/**
 * Repository interfaces — the seam.
 *
 * The UI depends on these and nothing else, so the store behind them can be an
 * in-memory mock today, IndexedDB next, and Postgres over HTTP after that
 * without a screen changing. Everything is async for that reason: a synchronous
 * mock that later becomes a network call would force every caller to be rewritten.
 *
 * DECISION: reads return ALL candidate records, not a pre-resolved value.
 * Conflict resolution lives in the domain layer (`resolveEffective`) so the
 * client and the future server cannot drift apart, and so the UI can show "two
 * sources disagree" instead of silently picking one.
 */
import type {
  AIInference,
  CalendarDate,
  Condition,
  Goal,
  IntakeEvent,
  LabPanel,
  Meal,
  Observation,
  ObservationCode,
  Regimen,
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
  listByDay(userId: UserId, day: CalendarDate): Promise<Meal[]>
  listByRange(userId: UserId, range: DateRange): Promise<Meal[]>
  add(meal: Meal): Promise<void>
}

export interface WorkoutRepository {
  listByDay(userId: UserId, day: CalendarDate): Promise<Workout[]>
  listByRange(userId: UserId, range: DateRange): Promise<Workout[]>
  add(workout: Workout): Promise<void>
}

export interface SleepRepository {
  /** Anchored to the wake day. */
  forDay(userId: UserId, day: CalendarDate): Promise<Sleep[]>
}

export interface ObservationRepository {
  /** All candidates for one code on one day — callers resolve precedence themselves. */
  listByDay(userId: UserId, day: CalendarDate, code?: ObservationCode): Promise<Observation[]>
  /** All candidates for the most recent day that has any, for a single code. */
  latest(userId: UserId, code: ObservationCode): Promise<Observation[]>
  add(observation: Observation): Promise<void>
}

export interface GoalRepository {
  listActive(userId: UserId): Promise<Goal[]>
}

/** Clinical reads exist as interfaces before any screen uses them — see docs/ARCHITECTURE.md. */
export interface ClinicalRepository {
  listPanels(userId: UserId): Promise<LabPanel[]>
  listConditions(userId: UserId): Promise<Condition[]>
  listRegimens(userId: UserId): Promise<Regimen[]>
  listIntakeEvents(userId: UserId, range: DateRange): Promise<IntakeEvent[]>
}

/**
 * The AI audit trail (D4, D13). Every inference is recorded — including the
 * ones that failed — so "why did the app think that?" always has an answer.
 */
export interface InferenceRepository {
  add(inference: AIInference): Promise<void>
  listByDay(userId: UserId, day: CalendarDate): Promise<AIInference[]>
  get(id: string): Promise<AIInference | undefined>
}

/**
 * Local-only key/value settings, holding the user's API key (D14).
 *
 * Deliberately NOT part of anything that syncs: when slice 3 adds the cloud,
 * this store stays on the device. That exclusion is the whole reason it is a
 * separate repository rather than a corner of the profile.
 */
export interface AppSettings {
  apiKey?: string
  model: string
  autoAnalyze: boolean
}

export interface SettingsRepository {
  get(): Promise<AppSettings>
  save(patch: Partial<AppSettings>): Promise<void>
}

export interface HealthRepositories {
  profiles: ProfileRepository
  meals: MealRepository
  workouts: WorkoutRepository
  sleep: SleepRepository
  observations: ObservationRepository
  goals: GoalRepository
  clinical: ClinicalRepository
  inferences: InferenceRepository
  settings: SettingsRepository
}
