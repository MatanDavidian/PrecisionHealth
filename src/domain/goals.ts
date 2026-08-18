import type { CalendarDate, Id, Quantity } from './primitives'
import type { Provenance } from './provenance'
import type { UserId } from './user'

export type GoalId = Id<'Goal'>
export type NutritionPlanId = Id<'NutritionPlan'>
export type WorkoutPlanId = Id<'WorkoutPlan'>

export type GoalMetric = 'PROTEIN' | 'ENERGY' | 'WEIGHT' | 'BODY_FAT' | 'STEPS' | 'SLEEP_DURATION'
export type GoalDirection = 'AT_LEAST' | 'AT_MOST' | 'REACH'

/**
 * Goals are deterministic and rule-evaluated (roadmap phase 8) — the AI proposes
 * them, but adherence is computed by the engine, never asserted by a model.
 */
export interface Goal {
  id: GoalId
  userId: UserId
  metric: GoalMetric
  direction: GoalDirection
  target: Quantity
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
