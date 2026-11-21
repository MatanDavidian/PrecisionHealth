import type { Id } from './ids'
import type { CalendarDate, IanaZone, Instant } from './time'
import type { MassUnit, LengthUnit, Quantity } from './units'
import type { ActivityLevel } from './targets'

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
   * The year only: age is what the burn estimate needs, and a full date of
   * birth would be more than that asks for (docs/features/daily-targets.md).
   */
  birthYear?: number
  /** How active a day usually is. Used only when no watch reports a burn. */
  activity?: ActivityLevel
  /**
   * The zone stamped onto new records. Historical records keep the zone they
   * were created with, so changing this never rewrites the past.
   */
  timezone: IanaZone
  /** Display preferences. Storage stays canonical regardless. */
  preferredMassUnit: MassUnit
  preferredLengthUnit: LengthUnit
}
