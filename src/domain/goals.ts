import type { Id } from './ids'
import type { CanonicalQuantity } from './units'
import type { ObservationCode } from './observation'
import type { Objective } from './objectives'
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
  /**
   * The programme this goal came from, when it was set by picking one.
   *
   * The `target` above is the daily energy aim as it stood at the time — a
   * snapshot, deliberately, so that retuning the rates later does not silently
   * rewrite what someone was aiming for last June (D4). The key is what the UI
   * reads to name it and to decide whether a target weight applies.
   */
  objective?: Objective
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

/**
 * The goal that currently counts for each metric.
 *
 * Goals are append-only like everything else (D4): changing your target weight
 * writes a NEW goal rather than editing the old one, so the history of what you
 * were aiming for survives. That means a reader can see several goals for one
 * metric, and the newest is the one in force.
 *
 * Ordered by when it was recorded rather than by `startsOn`, because two goals
 * can legitimately start on the same day — you set one, thought better of it,
 * and set another an hour later.
 */
export function currentGoals(goals: readonly Goal[]): Goal[] {
  const newest = new Map<GoalMetric, Goal>()
  for (const goal of goals) {
    if (!goal.active) continue
    const held = newest.get(goal.metric)
    if (!held || goal.provenance.recordedAt > held.provenance.recordedAt) {
      newest.set(goal.metric, goal)
    }
  }
  return [...newest.values()]
}

/** The goal in force for one metric, if there is one. */
export const goalFor = (goals: readonly Goal[], metric: GoalMetric): Goal | undefined =>
  currentGoals(goals).find((goal) => goal.metric === metric)

/**
 * Which way a target is meant to be approached.
 *
 * Derived from where you are rather than asked, because nobody thinks of a
 * target weight as having a direction — they think "I want to be 75". The
 * direction is what makes "did I get there?" answerable, and REACH would
 * demand hitting the number to within a gram.
 */
export const directionToward = (current: number, target: number): GoalDirection =>
  target < current ? 'AT_MOST' : 'AT_LEAST'

