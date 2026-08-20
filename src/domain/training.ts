import type { Id } from './ids'
import type { CanonicalQuantity } from './units'
import type { Provenance } from './provenance'
import type { TimeSemantics } from './time'
import type { UserId } from './user'

export type WorkoutId = Id<'Workout'>
export type ExerciseId = Id<'Exercise'>

export type WorkoutType =
  | 'STRENGTH'
  | 'RUNNING'
  | 'CYCLING'
  | 'SWIMMING'
  | 'SOCCER'
  | 'TENNIS'
  | 'OTHER'

export interface SetEntry {
  reps: number
  weight?: CanonicalQuantity
  /** Rate of perceived exertion, 1-10. Subjective load, needed for plan evaluation. */
  rpe?: number
}

export interface Exercise {
  id: ExerciseId
  workoutId: WorkoutId
  name: string
  sets: SetEntry[]
}

export interface Workout {
  id: WorkoutId
  userId: UserId
  type: WorkoutType
  time: TimeSemantics
  duration: CanonicalQuantity
  distance?: CanonicalQuantity
  activeEnergy?: CanonicalQuantity
  averageHeartRate?: CanonicalQuantity
  exercises: Exercise[]
  notes?: string
  provenance: Provenance
}
