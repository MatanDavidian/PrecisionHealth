/**
 * Observation — the spine of the model.
 *
 * DECISION: every scalar, coded, time-stamped fact is ONE type, whether it came
 * from a chest strap, a bathroom scale, a blood panel or the user's own opinion
 * of their energy level. Weight is not structurally different from HRV, and a
 * lab analyte is not structurally different from either. This mirrors FHIR's
 * Observation resource for the same reason FHIR does it: the alternative is a
 * near-identical table per metric, each needing its own repository, its own
 * sync path and its own conflict handling.
 *
 * The earlier draft had `Observation` and `Measurement` as separate types with
 * identical shapes. That split was cosmetic and has been removed.
 *
 * What does NOT belong here: anything with children. A Meal has food items, a
 * Workout has exercises, Sleep has stages. Those are aggregates and keep their
 * own types.
 */
import type { CanonicalQuantity } from './units'
import type { Id } from './ids'
import type { Provenance } from './provenance'
import type { TimeSemantics } from './time'
import type { UserId } from './user'

export type ObservationId = Id<'Observation'>

/** Drives which screen a value belongs to, and nothing else. */
export type ObservationCategory =
  | 'ACTIVITY'
  | 'RECOVERY'
  | 'BODY'
  | 'SUBJECTIVE'
  | 'CLINICAL'

export type ObservationCode =
  // ACTIVITY
  | 'STEPS'
  | 'ACTIVE_ENERGY'
  | 'DISTANCE'
  // RECOVERY
  | 'HRV'
  | 'RESTING_HEART_RATE'
  | 'RESPIRATION_RATE'
  | 'STRESS'
  | 'SLEEP_SCORE'
  // BODY
  | 'WEIGHT'
  | 'BODY_FAT'
  | 'MUSCLE_MASS'
  | 'WAIST'
  | 'CHEST'
  | 'ARM'
  | 'HIP'
  | 'THIGH'
  // SUBJECTIVE — self-reported, deliberately first-class rather than "notes"
  | 'ENERGY_RATING'
  | 'SORENESS'
  | 'MOOD'
  | 'HUNGER'
  // CLINICAL — the analyte is carried in `clinical.analyte`
  | 'LAB_ANALYTE'

export const CATEGORY_OF: Record<ObservationCode, ObservationCategory> = {
  STEPS: 'ACTIVITY',
  ACTIVE_ENERGY: 'ACTIVITY',
  DISTANCE: 'ACTIVITY',
  HRV: 'RECOVERY',
  RESTING_HEART_RATE: 'RECOVERY',
  RESPIRATION_RATE: 'RECOVERY',
  STRESS: 'RECOVERY',
  SLEEP_SCORE: 'RECOVERY',
  WEIGHT: 'BODY',
  BODY_FAT: 'BODY',
  MUSCLE_MASS: 'BODY',
  WAIST: 'BODY',
  CHEST: 'BODY',
  ARM: 'BODY',
  HIP: 'BODY',
  THIGH: 'BODY',
  ENERGY_RATING: 'SUBJECTIVE',
  SORENESS: 'SUBJECTIVE',
  MOOD: 'SUBJECTIVE',
  HUNGER: 'SUBJECTIVE',
  LAB_ANALYTE: 'CLINICAL',
}

/**
 * How far two readings of the same code may differ before we consider it a
 * disagreement worth asking the user about, in canonical units.
 *
 * These are judgement calls, not physics: 200 g between two morning weigh-ins
 * is normal variation, 2 kg is two different people or a broken scale.
 */
export const CONFLICT_TOLERANCE: Partial<Record<ObservationCode, number>> = {
  WEIGHT: 200, // g
  BODY_FAT: 0.5, // %
  STEPS: 250, // count
  ACTIVE_ENERGY: 50, // kcal
  HRV: 5, // ms
  RESTING_HEART_RATE: 3, // bpm
}

/** Extra fields that only clinical observations carry. */
export interface ClinicalDetail {
  /** Free text for now; LOINC coding when the clinical slice is built. */
  analyte: string
  panelId?: Id<'LabPanel'>
  referenceLow?: number
  referenceHigh?: number
  /** The PDF this value was extracted from. */
  documentId?: Id<'Attachment'>
}

export interface Observation {
  id: ObservationId
  userId: UserId
  code: ObservationCode
  time: TimeSemantics
  value: CanonicalQuantity
  provenance: Provenance
  clinical?: ClinicalDetail
}

export const categoryOf = (observation: Observation): ObservationCategory =>
  CATEGORY_OF[observation.code]
