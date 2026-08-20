/**
 * Clinical data.
 *
 * Three decisions were needed here, and the sketch in the roadmap doc made none
 * of them.
 *
 * DECISION 1 — a lab result IS an observation.
 * A blood glucose value is a coded, unit-bearing, time-stamped scalar with a
 * source. That is precisely `Observation`, and giving it its own type would
 * duplicate the conflict resolution, the day bucketing and the sync path for no
 * gain. Lab values are stored as Observations with `code: 'LAB_ANALYTE'` and a
 * `clinical` detail block. What remains here is the thing an Observation genuinely
 * cannot express: the PANEL. A CBC is one blood draw producing thirty analytes;
 * they share a collection time, a lab, and a source document, and they are read
 * together.
 *
 * DECISION 2 — medications and supplements are the same shape.
 * Both are "a substance, at a dose, on a schedule, over a period". Modelling them
 * separately would mean two tables, two adherence calculations and two places to
 * change when the AI needs to know what the user is taking. They are one
 * `Regimen` distinguished by a `kind` field. Vitamin D and metformin differ in
 * regulation, not in structure.
 *
 * DECISION 3 — intent is separate from fact.
 * A Regimen is what you are SUPPOSED to take. An IntakeEvent is what you
 * ACTUALLY took. Collapsing them makes adherence unanswerable, and adherence is
 * the entire reason to track medication in a health app. This is the same
 * raw-vs-derived split the roadmap insists on everywhere else.
 */
import type { Id } from './ids'
import type { CanonicalQuantity } from './units'
import type { Provenance } from './provenance'
import type { CalendarDate, Instant } from './time'
import type { UserId } from './user'
import type { AttachmentId } from './nutrition'

export type LabPanelId = Id<'LabPanel'>
export type ConditionId = Id<'Condition'>
export type RegimenId = Id<'Regimen'>
export type IntakeEventId = Id<'IntakeEvent'>

/**
 * One blood draw / one report. The individual analytes are Observations that
 * point back here via `clinical.panelId`.
 */
export interface LabPanel {
  id: LabPanelId
  userId: UserId
  name: string
  /** When blood was drawn — not when the report was issued. Trends need the former. */
  collectedAt: Instant
  reportedAt?: Instant
  laboratory?: string
  documentId?: AttachmentId
  provenance: Provenance
}

/**
 * Status is explicit because "do I still have this?" changes what the AI may
 * say. SUSPECTED exists so a user can record something a doctor is
 * investigating without it being asserted as fact.
 */
export type ConditionStatus = 'ACTIVE' | 'RESOLVED' | 'SUSPECTED'

export interface Condition {
  id: ConditionId
  userId: UserId
  name: string
  /** Optional ICD-10 / SNOMED code. Personal health record, not an EHR — coding stays optional. */
  code?: string
  status: ConditionStatus
  onsetDate?: CalendarDate
  resolvedDate?: CalendarDate
  notes?: string
  provenance: Provenance
}

export type RegimenKind = 'MEDICATION' | 'SUPPLEMENT'

/**
 * Structured rather than free text, because the rule engine has to generate
 * expected intakes from it, and an AI reminder cannot parse "twice a day with
 * food" reliably enough to be trusted with medication.
 */
export interface Schedule {
  /** Local times of day, HH:MM. */
  times: string[]
  /** 1 = every day, 2 = every other day. */
  everyNDays: number
  withFood?: boolean
}

export interface Regimen {
  id: RegimenId
  userId: UserId
  kind: RegimenKind
  substance: string
  dose: CanonicalQuantity
  schedule: Schedule
  startedOn: CalendarDate
  endedOn?: CalendarDate
  /** Why it is taken — links a regimen to the condition it treats. */
  forConditionId?: ConditionId
  provenance: Provenance
}

/** What actually happened. Adherence is derived by comparing these to the Regimen. */
export interface IntakeEvent {
  id: IntakeEventId
  userId: UserId
  regimenId: RegimenId
  takenAt: Instant
  /** Present when the user took a different amount than prescribed. */
  actualDose?: CanonicalQuantity
  skipped?: boolean
  provenance: Provenance
}
