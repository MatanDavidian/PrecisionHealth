import type { DurationUnit, EnergyUnit, Id, LengthUnit, MassUnit, Quantity, TimeSemantics } from './primitives'
import type { Provenance } from './provenance'
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

/** One set of a strength exercise. */
export interface SetEntry {
  reps: number
  weight?: Quantity<MassUnit>
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
  duration: Quantity<DurationUnit>
  /** Endurance sessions carry distance; strength sessions carry exercises. */
  distance?: Quantity<LengthUnit>
  activeEnergy?: Quantity<EnergyUnit>
  averageHeartRate?: Quantity<'bpm'>
  exercises: Exercise[]
  notes?: string
  provenance: Provenance
}
