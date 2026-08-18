/**
 * Shared primitives: identity, time semantics and units.
 *
 * Roadmap principle: every value carries an explicit unit. We never store a
 * bare number whose meaning depends on the reader's assumption.
 */

/** Branded id so a MealId can never be passed where a WorkoutId is expected. */
export type Id<T extends string> = string & { readonly __brand: T }

/** ISO-8601 instant, always UTC. Use for anything that happened at a point in time. */
export type Instant = string

/** ISO-8601 calendar date (YYYY-MM-DD) in the user's local timezone. */
export type CalendarDate = string

/**
 * Time semantics differ per record and the model must say which applies:
 * - `instant`   a measurement taken at a moment (weight, HRV reading)
 * - `interval`  something with a start and end (sleep, a workout)
 * - `daily`     an aggregate belonging to a calendar day (steps, total protein)
 */
export type TimeSemantics =
  | { kind: 'instant'; at: Instant }
  | { kind: 'interval'; start: Instant; end: Instant }
  | { kind: 'daily'; date: CalendarDate }

export type MassUnit = 'g' | 'kg' | 'mg' | 'lb'
export type EnergyUnit = 'kcal' | 'kJ'
export type LengthUnit = 'cm' | 'm' | 'km' | 'in'
export type DurationUnit = 'min' | 's' | 'h'
export type Unit =
  | MassUnit
  | EnergyUnit
  | LengthUnit
  | DurationUnit
  | 'bpm'
  | 'ms'
  | '%'
  | 'count'
  | 'mmol/L'
  | 'mg/dL'

/** A number that knows what it measures. */
export interface Quantity<U extends Unit = Unit> {
  value: number
  unit: U
}

export const quantity = <U extends Unit>(value: number, unit: U): Quantity<U> => ({ value, unit })
