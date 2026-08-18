/**
 * Provenance — the spine of the model.
 *
 * Roadmap principle: "A wearable measurement, a manual entry, a document-extracted
 * value and an AI estimate should not be treated as equivalent evidence."
 * Every record therefore carries where it came from, and AI-derived values carry
 * confidence plus whether a human confirmed them.
 */
import type { Id, Instant } from './primitives'

export type DataSource =
  | 'USER'
  | 'GARMIN'
  | 'APPLE_HEALTH'
  | 'HEALTH_CONNECT'
  | 'AI_ESTIMATE'
  | 'LAB_DOCUMENT'

/** Raw = as measured/entered. Derived = computed. Never overwrite raw with derived. */
export type ValueKind = 'RAW' | 'USER_CONFIRMED' | 'DERIVED'

export interface Provenance {
  source: DataSource
  kind: ValueKind
  /** When the source produced it (not when we stored it). */
  recordedAt: Instant
  /** Present only for AI_ESTIMATE. 0..1 */
  confidence?: number
  /** Links back to the inference that produced this value, for auditability. */
  inferenceId?: AIInferenceId
}

export type AIInferenceId = Id<'AIInference'>

/** Every AI write is logged as an auditable inference, per the roadmap's safety section. */
export interface AIInference {
  id: AIInferenceId
  userId: string
  /** e.g. 'FOOD_PHOTO_ESTIMATE' | 'HEALTH_SCAN' | 'PLAN_GENERATION' */
  purpose: string
  model: string
  modelVersion: string
  createdAt: Instant
  confidence: number
  /** Ids of the records the inference read. */
  inputReferences: string[]
  output: unknown
  userConfirmed: boolean
  /** Set when a later inference replaces this one; keeps history intact. */
  supersededBy?: AIInferenceId
  safetyFlags: string[]
}

/** Convenience for the common case of a user-entered value. */
export const userEntered = (recordedAt: Instant): Provenance => ({
  source: 'USER',
  kind: 'RAW',
  recordedAt,
})
