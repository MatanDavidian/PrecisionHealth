import type { CalendarDate, Id, Quantity, TimeSemantics } from './primitives'
import type { Provenance } from './provenance'
import type { AttachmentId } from './nutrition'
import type { UserId } from './user'

export type LabResultId = Id<'LabResult'>
export type ConditionId = Id<'Condition'>
export type MedicationId = Id<'Medication'>
export type SupplementId = Id<'Supplement'>

export interface ReferenceRange {
  low?: number
  high?: number
  unit: string
}

export interface LabResult {
  id: LabResultId
  userId: UserId
  /** Prefer a coded analyte (LOINC) once the model matures; name is the interim. */
  analyte: string
  time: TimeSemantics
  value: Quantity
  referenceRange?: ReferenceRange
  /** The PDF this value was extracted from, when source is LAB_DOCUMENT. */
  documentId?: AttachmentId
  provenance: Provenance
}

export interface Condition {
  id: ConditionId
  userId: UserId
  name: string
  diagnosedOn?: CalendarDate
  active: boolean
  provenance: Provenance
}

export interface Medication {
  id: MedicationId
  userId: UserId
  name: string
  dose: Quantity
  schedule: string
  startedOn?: CalendarDate
  endedOn?: CalendarDate
  provenance: Provenance
}

export interface Supplement {
  id: SupplementId
  userId: UserId
  name: string
  dose: Quantity
  schedule: string
  provenance: Provenance
}
