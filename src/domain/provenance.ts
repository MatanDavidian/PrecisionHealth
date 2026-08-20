/**
 * Provenance and conflict resolution.
 *
 * DECISION: records are append-only. Nothing is ever mutated or deleted — a
 * correction is a NEW record that supersedes an old one. This is what makes
 * "the AI guessed 170 g, then I corrected it to 190 g" a auditable history
 * rather than a lost fact, and it is the only way an AI write can be safely
 * undone.
 *
 * DECISION: when several records describe the same thing, precedence is
 *   USER_CONFIRMED > device measurement > AI_ESTIMATE
 * and within the same rank, the most recent wins.
 *
 * DECISION: when two sources disagree by more than the metric's tolerance, we
 * do NOT silently pick a winner — we raise a Conflict for the user to settle.
 * Their answer is written back as a USER_CONFIRMED record, which is both the
 * resolution and the training signal.
 */
import type { Id } from './ids'
import type { Instant } from './time'

export type DataSource =
  | 'USER'
  | 'GARMIN'
  | 'APPLE_HEALTH'
  | 'HEALTH_CONNECT'
  | 'SMART_SCALE'
  | 'AI_ESTIMATE'
  | 'LAB_DOCUMENT'

/**
 * RAW            as measured or entered, untouched
 * USER_CONFIRMED a human looked at it and said yes
 * DERIVED        computed or estimated; never overwrites RAW
 */
export type ValueKind = 'RAW' | 'USER_CONFIRMED' | 'DERIVED'

export type AIInferenceId = Id<'AIInference'>
export type RecordId = string

export interface Provenance {
  source: DataSource
  kind: ValueKind
  /** When the source produced the value — not when we stored it. */
  recordedAt: Instant
  /** 0..1, present only for AI_ESTIMATE. */
  confidence?: number
  /** Audit link back to the inference that produced this value. */
  inferenceId?: AIInferenceId
  /** Ids this record replaces. Append-only correction chain. */
  supersedes?: RecordId[]
}

/** Higher wins. Kind dominates source: a user-confirmed value always beats a device. */
const KIND_RANK: Record<ValueKind, number> = {
  USER_CONFIRMED: 300,
  RAW: 200,
  DERIVED: 100,
}

/**
 * Tie-break within a kind. A dedicated scale outranks a phone's estimate of the
 * same quantity; a lab document outranks both for clinical analytes.
 */
const SOURCE_RANK: Record<DataSource, number> = {
  USER: 60,
  LAB_DOCUMENT: 50,
  SMART_SCALE: 40,
  GARMIN: 30,
  APPLE_HEALTH: 20,
  HEALTH_CONNECT: 20,
  AI_ESTIMATE: 0,
}

export const precedenceOf = (p: Provenance): number => KIND_RANK[p.kind] * 100 + SOURCE_RANK[p.source]

export interface Provenanced {
  id: string
  provenance: Provenance
}

/**
 * Pick the value that should be shown, from several describing the same thing.
 * Pure and dependency-free on purpose: the client and the future server must
 * reach the same answer, so this function is the single definition of "true".
 */
/**
 * Records nothing has replaced.
 *
 * Every reader must filter these out, not just `resolveEffective` — a
 * superseded record is history, and history does not get a vote. Missing this
 * in `detectConflict` meant a disagreement the user had already settled kept
 * being raised, because the record they rejected was still arguing with the
 * decision that rejected it.
 */
export function liveRecords<T extends Provenanced>(candidates: readonly T[]): T[] {
  const superseded = new Set(candidates.flatMap((c) => c.provenance.supersedes ?? []))
  return candidates.filter((c) => !superseded.has(c.id))
}

export function resolveEffective<T extends Provenanced>(candidates: readonly T[]): T | undefined {
  const live = liveRecords(candidates)

  return [...live].sort((a, b) => {
    const byPrecedence = precedenceOf(b.provenance) - precedenceOf(a.provenance)
    if (byPrecedence !== 0) return byPrecedence
    return Date.parse(b.provenance.recordedAt) - Date.parse(a.provenance.recordedAt)
  })[0]
}

export interface Conflict<T extends Provenanced = Provenanced> {
  /** What the precedence rule would pick if nobody intervened. */
  effective: T
  /** The credible disagreeing records, strongest first. */
  competing: T[]
  /** Largest absolute gap between the effective value and a competitor. */
  spread: number
}

/**
 * Detect a disagreement worth a human's attention.
 *
 * `tolerance` is per-metric and deliberately a caller argument: 0.2 kg between
 * two scales is noise, 0.2 kg between "what I logged" and "what the AI guessed"
 * for a food portion is not.
 */
export function detectConflict<T extends Provenanced>(
  candidates: readonly T[],
  valueOf: (record: T) => number,
  tolerance: number,
): Conflict<T> | undefined {
  // Only live records can disagree. Once the user settles a conflict, their
  // decision supersedes every candidate, so there is nothing left to argue.
  const live = liveRecords(candidates)
  const effective = resolveEffective(live)
  if (!effective || live.length < 2) return undefined

  const base = valueOf(effective)
  const competing = live
    .filter((c) => c.id !== effective.id && Math.abs(valueOf(c) - base) > tolerance)
    .sort((a, b) => precedenceOf(b.provenance) - precedenceOf(a.provenance))

  if (competing.length === 0) return undefined

  const spread = Math.max(...competing.map((c) => Math.abs(valueOf(c) - base)))
  return { effective, competing, spread }
}

/** True when a value is an AI guess nobody has signed off on yet. */
export const needsConfirmation = (p: Provenance): boolean =>
  p.source === 'AI_ESTIMATE' && p.kind !== 'USER_CONFIRMED'

/**
 * Every AI write is logged as an auditable inference. The record survives even
 * when its output is superseded, so "why did the app think that?" always has an
 * answer.
 */
export interface AIInference {
  id: AIInferenceId
  userId: string
  purpose: 'FOOD_PHOTO_ESTIMATE' | 'HEALTH_SCAN' | 'PLAN_GENERATION' | 'DOCUMENT_EXTRACTION'
  model: string
  modelVersion: string
  createdAt: Instant
  confidence: number
  /** Ids of the records the inference read — the evidence trail. */
  inputReferences: RecordId[]
  output: unknown
  userConfirmed: boolean
  supersededBy?: AIInferenceId
  safetyFlags: string[]
}

export const userEntered = (recordedAt: Instant): Provenance => ({
  source: 'USER',
  kind: 'RAW',
  recordedAt,
})

export const deviceReading = (source: DataSource, recordedAt: Instant): Provenance => ({
  source,
  kind: 'RAW',
  recordedAt,
})

export const aiEstimate = (
  recordedAt: Instant,
  confidence: number,
  inferenceId: AIInferenceId,
): Provenance => ({
  source: 'AI_ESTIMATE',
  kind: 'DERIVED',
  recordedAt,
  confidence,
  inferenceId,
})
