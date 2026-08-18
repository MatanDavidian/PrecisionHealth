import type { DurationUnit, Id, Quantity, TimeSemantics } from './primitives'
import type { Provenance } from './provenance'
import type { UserId } from './user'

export type SleepId = Id<'Sleep'>
export type ObservationId = Id<'Observation'>

export interface SleepStages {
  deep: Quantity<DurationUnit>
  light: Quantity<DurationUnit>
  rem: Quantity<DurationUnit>
  awake: Quantity<DurationUnit>
}

export interface Sleep {
  id: SleepId
  userId: UserId
  time: TimeSemantics
  duration: Quantity<DurationUnit>
  stages?: SleepStages
  /** Vendor score (Garmin/Apple). Keep vendor-derived values clearly labelled. */
  score?: number
  provenance: Provenance
}

/**
 * Generic time-series datum — modelled on FHIR Observation.
 * Anything scalar that streams from a device or a manual log lives here rather
 * than growing a bespoke table per metric.
 */
export type ObservationCode =
  | 'HRV'
  | 'RESTING_HEART_RATE'
  | 'STEPS'
  | 'ACTIVE_ENERGY'
  | 'RESPIRATION'
  | 'STRESS'
  | 'ENERGY_RATING'
  | 'SORENESS'
  | 'MOOD'

export interface Observation {
  id: ObservationId
  userId: UserId
  code: ObservationCode
  time: TimeSemantics
  value: Quantity
  provenance: Provenance
}
