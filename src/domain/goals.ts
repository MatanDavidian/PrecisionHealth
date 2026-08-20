import type { Id } from './ids'
import type { CanonicalQuantity } from './units'
import type { ObservationCode } from './observation'
import type { Provenance } from './provenance'
import type { CalendarDate } from './time'
import type { UserId } from './user'

export type GoalId = Id<'Goal'>
export type NutritionPlanId = Id<'NutritionPlan'>
export type WorkoutPlanId = Id<'WorkoutPlan'>

/** Nutrition targets are not ObservationCodes — they are derived from meals. */
export type GoalMetric = ObservationCode | 'PROTEIN' | 'ENERGY' | 'CARBS' | 'FAT' | 'SLEEP_DURATION'

export type GoalDirection = 'AT_LEAST' | 'AT_MOST' | 'REACH'

/**
 * Goals are evaluated by the rule engine, never asserted by a model. An AI may
 * propose a goal; whether you hit it is arithmetic.
 */
export interface Goal {
  id: GoalId
  userId: UserId
  metric: GoalMetric
  direction: GoalDirection
  target: CanonicalQuantity
  startsOn: CalendarDate
  endsOn?: CalendarDate
  active: boolean
  provenance: Provenance
}

export interface NutritionPlan {
  id: NutritionPlanId
  userId: UserId
  name: string
  dailyTargets: Goal[]
  provenance: Provenance
}

export interface PlannedSession {
  /** 1 = Monday. */
  dayOfWeek: number
  focus: string
  durationMinutes: number
}

export interface WorkoutPlan {
  id: WorkoutPlanId
  userId: UserId
  name: string
  sessions: PlannedSession[]
  startsOn: CalendarDate
  endsOn?: CalendarDate
  provenance: Provenance
}
