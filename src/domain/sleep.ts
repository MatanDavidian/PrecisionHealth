/**
 * Sleep is an interval that routinely spans midnight, so it is the one record
 * whose day attribution is not obvious. It is anchored to the WAKE day — see
 * `dayKeyOf(time, 'END')` in time.ts.
 */
import type { Id } from './ids'
import type { CanonicalQuantity } from './units'
import type { Provenance } from './provenance'
import type { TimeSemantics } from './time'
import type { UserId } from './user'

export type SleepId = Id<'Sleep'>

export interface SleepStages {
  deep: CanonicalQuantity
  light: CanonicalQuantity
  rem: CanonicalQuantity
  awake: CanonicalQuantity
}

export interface Sleep {
  id: SleepId
  userId: UserId
  time: TimeSemantics
  duration: CanonicalQuantity
  stages?: SleepStages
  provenance: Provenance
}
