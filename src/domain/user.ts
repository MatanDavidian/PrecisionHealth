import type { Id } from './ids'
import type { CalendarDate, IanaZone, Instant } from './time'
import type { MassUnit, LengthUnit, Quantity } from './units'

export type UserId = Id<'User'>

export interface User {
  id: UserId
  email: string
  createdAt: Instant
}

export type Sex = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED'

export interface UserProfile {
  userId: UserId
  displayName: string
  birthDate?: CalendarDate
  /** Present because reference ranges and body-composition formulas need it — not for personalisation copy. */
  sex?: Sex
  height?: Quantity<LengthUnit>
  /**
   * The zone stamped onto new records. Historical records keep the zone they
   * were created with, so changing this never rewrites the past.
   */
  timezone: IanaZone
  /** Display preferences. Storage stays canonical regardless. */
  preferredMassUnit: MassUnit
  preferredLengthUnit: LengthUnit
}
