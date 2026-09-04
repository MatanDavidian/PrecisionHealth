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
  /**
   * Every active goal, including superseded ones for the same metric.
   *
   * Goals are append-only like the rest (D4), so changing a target appends
   * rather than edits. `currentGoals` picks the newest per metric; the reader
   * is not handed a pre-resolved answer, exactly as with observations.
   */
  listActive(userId: UserId): Promise<Goal[]>
  add(goal: Goal): Promise<void>
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
/**
 * Device-local settings.
 *
 * There is deliberately no "where to store my data" preference. Before
 * accounts existed it recorded intent — browser, file, or a server — but
 * storage is now a consequence of being signed in, not a choice made here, and
 * a control implying otherwise would be describing a decision the app does not
 * actually take.
 */
export interface AppSettings {
  apiKey?: string
  model: string
  autoAnalyze: boolean
  /**
   * Which model to ask for while on the free trial.
   *
   * Unset means "follow the app's suggestion", which opens on the best model
   * and moves to the faster one after a couple of analyses. Once the user
   * chooses explicitly, their choice stands — the server clamps it to what
   * they may actually have.
   */
  trialModel?: string
  /**
   * This device's copy of the chosen language (D21).
   *
   * The preference proper lives on the account, in `user_preferences`, so it
   * follows a person between devices. This copy is what makes the app work
   * signed out, work offline, and switch the instant you tap rather than after
   * a round trip. Unset means "follow the browser", and is also what makes the
   * app ask.
   */
  language?: 'en' | 'he'
}

export interface SettingsRepository {
  get(): Promise<AppSettings>
  save(patch: Partial<AppSettings>): Promise<void>
}

/**
 * Every record held about one person, with no window over it.
 *
 * Deliberately not assembled from the reads above. Those are all anchored to a
 * day or a range, which is right for screens and wrong for this: an export has
 * to be COMPLETE, and a range is a way of quietly missing whatever falls
 * outside it. "Everything" has to be asked for as everything.
 */
export interface PersonalRecords {
  profile?: UserProfile
  meals: Meal[]
  workouts: Workout[]
  sleep: Sleep[]
  observations: Observation[]
  goals: Goal[]
  labPanels: LabPanel[]
  conditions: Condition[]
  regimens: Regimen[]
  intakeEvents: IntakeEvent[]
  inferences: AIInference[]
}

/**
 * Taking your data with you.
 *
 * Its own repository rather than an `everything()` bolted onto each of the
 * nine above: the question is about the person as a whole, and belongs to
 * meals no more than to sleep.
 *
 * There is deliberately no `erase` here. Deleting an account and clearing this
 * browser are not two implementations of one operation — one is a privileged
 * server call that removes an auth user, the other is a local wipe of the
 * signed-out store — and a shared method would only be a name they both
 * answer to. `eraseLocalRecords` handles the second, beside `seedOnce`.
 */
export interface AccountRepository {
  everything(userId: UserId): Promise<PersonalRecords>
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
  account: AccountRepository
}
