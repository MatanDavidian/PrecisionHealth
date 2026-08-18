/**
 * Mock dataset — the sample day from the roadmap doc and the Timeline mockup
 * (18 Aug). Every record carries realistic provenance so the UI is exercised
 * against mixed sources from day one: device data, manual entries and one
 * unconfirmed AI estimate.
 */
import {
  quantity,
  type Goal,
  type Meal,
  type Measurement,
  type Observation,
  type Sleep,
  type UserId,
  type UserProfile,
  type Workout,
} from '@/domain'
import type {
  AIInferenceId,
  ExerciseId,
  FoodItemId,
  GoalId,
  MealId,
  MeasurementId,
  ObservationId,
  Provenance,
  SleepId,
  WorkoutId,
} from '@/domain'

export const DEMO_USER_ID = 'user-demo' as UserId
export const DEMO_DATE = '2026-08-18'

const at = (time: string) => `${DEMO_DATE}T${time}:00Z`

const garmin = (recordedAt: string): Provenance => ({
  source: 'GARMIN',
  kind: 'RAW',
  recordedAt,
})
const manual = (recordedAt: string): Provenance => ({
  source: 'USER',
  kind: 'RAW',
  recordedAt,
})

export const profile: UserProfile = {
  userId: DEMO_USER_ID,
  displayName: 'Matan',
  preferredMassUnit: 'kg',
  height: quantity(178, 'cm'),
  timezone: 'Asia/Jerusalem',
}

export const sleep: Sleep = {
  id: 'sleep-1' as SleepId,
  userId: DEMO_USER_ID,
  time: { kind: 'interval', start: `${DEMO_DATE}T23:10:00Z`, end: at('06:42') },
  duration: quantity(452, 'min'), // 7h 32m
  score: 78,
  provenance: garmin(at('06:42')),
}

export const observations: Observation[] = [
  {
    id: 'obs-hrv' as ObservationId,
    userId: DEMO_USER_ID,
    code: 'HRV',
    time: { kind: 'instant', at: at('06:42') },
    value: quantity(54, 'ms'),
    provenance: garmin(at('06:42')),
  },
  {
    id: 'obs-rhr' as ObservationId,
    userId: DEMO_USER_ID,
    code: 'RESTING_HEART_RATE',
    time: { kind: 'instant', at: at('06:42') },
    value: quantity(57, 'bpm'),
    provenance: garmin(at('06:42')),
  },
  {
    id: 'obs-steps' as ObservationId,
    userId: DEMO_USER_ID,
    code: 'STEPS',
    time: { kind: 'daily', date: DEMO_DATE },
    value: quantity(9412, 'count'),
    provenance: garmin(at('20:00')),
  },
  {
    id: 'obs-active-kcal' as ObservationId,
    userId: DEMO_USER_ID,
    code: 'ACTIVE_ENERGY',
    time: { kind: 'daily', date: DEMO_DATE },
    value: quantity(640, 'kcal'),
    provenance: garmin(at('20:00')),
  },
]

export const measurements: Measurement[] = [
  {
    id: 'meas-weight' as MeasurementId,
    userId: DEMO_USER_ID,
    code: 'WEIGHT',
    time: { kind: 'instant', at: at('06:50') },
    value: quantity(72.8, 'kg'),
    provenance: garmin(at('06:50')),
  },
  {
    id: 'meas-bodyfat' as MeasurementId,
    userId: DEMO_USER_ID,
    code: 'BODY_FAT',
    time: { kind: 'instant', at: at('06:50') },
    value: quantity(14.2, '%'),
    provenance: garmin(at('06:50')),
  },
]

export const meals: Meal[] = [
  {
    id: 'meal-breakfast' as MealId,
    userId: DEMO_USER_ID,
    slot: 'BREAKFAST',
    time: { kind: 'instant', at: at('07:20') },
    items: [
      {
        id: 'food-eggs' as FoodItemId,
        mealId: 'meal-breakfast' as MealId,
        name: 'Eggs and oats',
        amount: quantity(320, 'g'),
        nutrients: {
          energy: quantity(560, 'kcal'),
          protein: quantity(32, 'g'),
          carbs: quantity(58, 'g'),
          fat: quantity(19, 'g'),
        },
        provenance: manual(at('07:25')),
      },
    ],
    provenance: manual(at('07:25')),
  },
  {
    id: 'meal-lunch' as MealId,
    userId: DEMO_USER_ID,
    slot: 'LUNCH',
    time: { kind: 'instant', at: at('13:05') },
    items: [
      {
        id: 'food-chicken' as FoodItemId,
        mealId: 'meal-lunch' as MealId,
        name: 'Grilled chicken breast',
        amount: quantity(170, 'g'),
        nutrients: {
          energy: quantity(281, 'kcal'),
          protein: quantity(53, 'g'),
          carbs: quantity(0, 'g'),
          fat: quantity(6, 'g'),
        },
        // The roadmap's worked example: an AI photo estimate, not yet confirmed.
        provenance: {
          source: 'AI_ESTIMATE',
          kind: 'DERIVED',
          recordedAt: at('13:06'),
          confidence: 0.72,
          inferenceId: 'inf-food-1' as AIInferenceId,
        },
      },
      {
        id: 'food-rice' as FoodItemId,
        mealId: 'meal-lunch' as MealId,
        name: 'Rice and vegetables',
        amount: quantity(280, 'g'),
        nutrients: {
          energy: quantity(430, 'kcal'),
          protein: quantity(11, 'g'),
          carbs: quantity(86, 'g'),
          fat: quantity(5, 'g'),
        },
        provenance: manual(at('13:06')),
      },
    ],
    provenance: manual(at('13:06')),
  },
  {
    id: 'meal-dinner' as MealId,
    userId: DEMO_USER_ID,
    slot: 'DINNER',
    time: { kind: 'instant', at: at('19:40') },
    items: [
      {
        id: 'food-salmon' as FoodItemId,
        mealId: 'meal-dinner' as MealId,
        name: 'Salmon, potatoes, salad',
        amount: quantity(430, 'g'),
        nutrients: {
          energy: quantity(859, 'kcal'),
          protein: quantity(32, 'g'),
          carbs: quantity(86, 'g'),
          fat: quantity(38, 'g'),
        },
        provenance: manual(at('19:45')),
      },
    ],
    provenance: manual(at('19:45')),
  },
]

export const workouts: Workout[] = [
  {
    id: 'workout-1' as WorkoutId,
    userId: DEMO_USER_ID,
    type: 'STRENGTH',
    time: { kind: 'interval', start: at('17:30'), end: at('18:32') },
    duration: quantity(62, 'min'),
    activeEnergy: quantity(410, 'kcal'),
    averageHeartRate: quantity(118, 'bpm'),
    exercises: [
      {
        id: 'ex-bench' as ExerciseId,
        workoutId: 'workout-1' as WorkoutId,
        name: 'Bench press',
        sets: [
          { reps: 8, weight: quantity(70, 'kg'), rpe: 7 },
          { reps: 8, weight: quantity(75, 'kg'), rpe: 8 },
          { reps: 6, weight: quantity(80, 'kg'), rpe: 9 },
        ],
      },
      {
        id: 'ex-row' as ExerciseId,
        workoutId: 'workout-1' as WorkoutId,
        name: 'Barbell row',
        sets: [
          { reps: 10, weight: quantity(60, 'kg'), rpe: 7 },
          { reps: 10, weight: quantity(60, 'kg'), rpe: 8 },
        ],
      },
    ],
    notes: 'Chest / back',
    provenance: garmin(at('18:32')),
  },
]

export const goals: Goal[] = [
  {
    id: 'goal-protein' as GoalId,
    userId: DEMO_USER_ID,
    metric: 'PROTEIN',
    direction: 'AT_LEAST',
    target: quantity(145, 'g'),
    startsOn: '2026-08-01',
    active: true,
    provenance: manual(`2026-08-01T08:00:00Z`),
  },
  {
    id: 'goal-steps' as GoalId,
    userId: DEMO_USER_ID,
    metric: 'STEPS',
    direction: 'AT_LEAST',
    target: quantity(10000, 'count'),
    startsOn: '2026-08-01',
    active: true,
    provenance: manual(`2026-08-01T08:00:00Z`),
  },
]
