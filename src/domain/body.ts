import type { Id, LengthUnit, MassUnit, Quantity, TimeSemantics } from './primitives'
import type { Provenance } from './provenance'
import type { UserId } from './user'

export type MeasurementId = Id<'Measurement'>

export type MeasurementCode =
  | 'WEIGHT'
  | 'BODY_FAT'
  | 'MUSCLE_MASS'
  | 'WAIST'
  | 'CHEST'
  | 'ARM'
  | 'HIP'
  | 'THIGH'

export interface Measurement {
  id: MeasurementId
  userId: UserId
  code: MeasurementCode
  time: TimeSemantics
  value: Quantity<MassUnit | LengthUnit | '%'>
  provenance: Provenance
}
