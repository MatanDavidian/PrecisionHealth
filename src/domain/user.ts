import type { CalendarDate, Id, Instant, LengthUnit, MassUnit, Quantity } from './primitives'

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
  sex?: Sex
  height?: Quantity<LengthUnit>
  /** Unit preferences drive display only; storage stays canonical. */
  preferredMassUnit: MassUnit
  timezone: string
}
