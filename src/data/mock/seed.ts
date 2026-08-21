/**
 * Seed dataset — the 18 Aug sample day from the roadmap doc and the Timeline
 * mockup, in Asia/Jerusalem.
 *
 * Deliberately not clean: it contains an unconfirmed AI portion estimate AND a
 * genuine two-source weight disagreement, so the provenance and conflict paths
 * are exercised by the app's very first screen rather than by tests alone.
 */
import { LOCAL_USER_ID } from '@/data/session'
import {
  addDays,
  asId,
  canonical,
  aiEstimate,
  deviceReading,
  userEntered,
  zonedTimeToUtc,
  type AIInferenceId,
  type CalendarDate,
  type Condition,
  type ExerciseId,
  type FoodItemId,
  type Goal,
  type GoalId,
  type IanaZone,
  type IntakeEvent,
  type LabPanel,
  type Meal,
  type MealId,
  type Observation,
  type ObservationId,
  type Regimen,
  type Sleep,
  type SleepId,
  type UserProfile,
  type Workout,
  type WorkoutId,
} from '@/domain'

/** Re-exported so the seed and the app agree on who the local user is. */
export const DEMO_USER_ID = LOCAL_USER_ID
export const ZONE: IanaZone = 'Asia/Jerusalem'
/** The day the fixed sample set describes. Tests pin to this. */
export const DEMO_DAY = '2026-08-18'

/**
 * The sample day is built for a target date rather than hardcoded, so a fresh
 * install opens on a populated TODAY instead of an empty screen with the data
 * two days in the past. Tests use the fixed export below.
 */
export function buildSeed(day: CalendarDate = DEMO_DAY, zone: IanaZone = ZONE) {
  const utc = (localHHMM: string, dayOffset = 0): string =>
    zonedTimeToUtc(addDays(day, dayOffset), localHHMM, zone)
  const DEMO_DAY = day
  const ZONE = zone

  const profile: UserProfile = {
  userId: DEMO_USER_ID,
  displayName: 'Matan',
  timezone: ZONE,
  height: { value: 178, unit: 'cm' },
  preferredMassUnit: 'kg',
  preferredLengthUnit: 'cm',
}

  const sleep: Sleep[] = [
  {
    id: asId<'Sleep'>('sleep-1') as SleepId,
    userId: DEMO_USER_ID,
    // Starts on the 17th, ends on the 18th — attributed to the WAKE day.
    time: { kind: 'interval', start: utc('23:10', -1), end: utc('06:42'), zone: ZONE },
    duration: canonical(452, 'min'),
    provenance: deviceReading('GARMIN', utc('06:42')),
  },
]

  const observations: Observation[] = [
  {
    id: asId<'Observation'>('obs-hrv') as ObservationId,
    userId: DEMO_USER_ID,
    code: 'HRV',
    time: { kind: 'instant', at: utc('06:42'), zone: ZONE },
    value: canonical(54, 'ms'),
    provenance: deviceReading('GARMIN', utc('06:42')),
  },
  {
    id: asId<'Observation'>('obs-rhr') as ObservationId,
    userId: DEMO_USER_ID,
    code: 'RESTING_HEART_RATE',
    time: { kind: 'instant', at: utc('06:42'), zone: ZONE },
    value: canonical(57, 'bpm'),
    provenance: deviceReading('GARMIN', utc('06:42')),
  },
  {
    id: asId<'Observation'>('obs-steps') as ObservationId,
    userId: DEMO_USER_ID,
    code: 'STEPS',
    time: { kind: 'daily', date: DEMO_DAY, zone: ZONE },
    value: canonical(9412, 'count'),
    provenance: deviceReading('GARMIN', utc('20:00')),
  },
  {
    id: asId<'Observation'>('obs-active-kcal') as ObservationId,
    userId: DEMO_USER_ID,
    code: 'ACTIVE_ENERGY',
    time: { kind: 'daily', date: DEMO_DAY, zone: ZONE },
    value: canonical(640, 'kcal'),
    provenance: deviceReading('GARMIN', utc('20:00')),
  },
  // --- Two sources, one morning, genuine disagreement -----------------------
  {
    id: asId<'Observation'>('obs-weight-scale') as ObservationId,
    userId: DEMO_USER_ID,
    code: 'WEIGHT',
    time: { kind: 'instant', at: utc('06:50'), zone: ZONE },
    value: canonical(72.8, 'kg'),
    provenance: deviceReading('SMART_SCALE', utc('06:50')),
  },
  {
    // Phone-based estimate 900 g off the scale — past the 200 g tolerance, so
    // the UI raises it rather than quietly averaging or picking one.
    id: asId<'Observation'>('obs-weight-phone') as ObservationId,
    userId: DEMO_USER_ID,
    code: 'WEIGHT',
    time: { kind: 'instant', at: utc('07:05'), zone: ZONE },
    value: canonical(73.7, 'kg'),
    provenance: deviceReading('APPLE_HEALTH', utc('07:05')),
  },
  {
    id: asId<'Observation'>('obs-bodyfat') as ObservationId,
    userId: DEMO_USER_ID,
    code: 'BODY_FAT',
    time: { kind: 'instant', at: utc('06:50'), zone: ZONE },
    value: canonical(14.2, '%'),
    provenance: deviceReading('SMART_SCALE', utc('06:50')),
  },
  {
    id: asId<'Observation'>('obs-energy') as ObservationId,
    userId: DEMO_USER_ID,
    code: 'ENERGY_RATING',
    time: { kind: 'daily', date: DEMO_DAY, zone: ZONE },
    value: canonical(8, 'score'),
    provenance: userEntered(utc('21:30')),
  },
]

  const FOOD_INFERENCE = asId<'AIInference'>('inf-food-1') as AIInferenceId

  const meals: Meal[] = [
  {
    id: asId<'Meal'>('meal-breakfast') as MealId,
    recordId: 'meal-breakfast-v1',
    version: 1,
    userId: DEMO_USER_ID,
    slot: 'BREAKFAST',
    time: { kind: 'instant', at: utc('07:20'), zone: ZONE },
    items: [
      {
        id: asId<'FoodItem'>('food-eggs') as FoodItemId,
        mealId: asId<'Meal'>('meal-breakfast') as MealId,
        name: 'Eggs and oats',
        amount: canonical(320, 'g'),
        nutrients: {
          energy: canonical(560, 'kcal'),
          protein: canonical(32, 'g'),
          carbs: canonical(58, 'g'),
          fat: canonical(19, 'g'),
        },
        provenance: userEntered(utc('07:25')),
      },
    ],
    provenance: userEntered(utc('07:25')),
  },
  {
    id: asId<'Meal'>('meal-lunch') as MealId,
    recordId: 'meal-lunch-v1',
    version: 1,
    userId: DEMO_USER_ID,
    slot: 'LUNCH',
    time: { kind: 'instant', at: utc('13:05'), zone: ZONE },
    items: [
      {
        // The roadmap's own worked example: 170 g chicken at 0.72 confidence.
        id: asId<'FoodItem'>('food-chicken') as FoodItemId,
        mealId: asId<'Meal'>('meal-lunch') as MealId,
        name: 'Grilled chicken breast',
        amount: canonical(170, 'g'),
        nutrients: {
          energy: canonical(281, 'kcal'),
          protein: canonical(53, 'g'),
          carbs: canonical(0, 'g'),
          fat: canonical(6, 'g'),
        },
        provenance: aiEstimate(utc('13:06'), 0.72, FOOD_INFERENCE),
      },
      {
        id: asId<'FoodItem'>('food-rice') as FoodItemId,
        mealId: asId<'Meal'>('meal-lunch') as MealId,
        name: 'Rice and vegetables',
        amount: canonical(280, 'g'),
        nutrients: {
          energy: canonical(430, 'kcal'),
          protein: canonical(11, 'g'),
          carbs: canonical(86, 'g'),
          fat: canonical(5, 'g'),
        },
        provenance: userEntered(utc('13:06')),
      },
    ],
    provenance: userEntered(utc('13:06')),
  },
  {
    id: asId<'Meal'>('meal-dinner') as MealId,
    recordId: 'meal-dinner-v1',
    version: 1,
    userId: DEMO_USER_ID,
    slot: 'DINNER',
    time: { kind: 'instant', at: utc('19:40'), zone: ZONE },
    items: [
      {
        id: asId<'FoodItem'>('food-salmon') as FoodItemId,
        mealId: asId<'Meal'>('meal-dinner') as MealId,
        name: 'Salmon, potatoes, salad',
        amount: canonical(430, 'g'),
        nutrients: {
          energy: canonical(859, 'kcal'),
          protein: canonical(32, 'g'),
          carbs: canonical(86, 'g'),
          fat: canonical(38, 'g'),
        },
        provenance: userEntered(utc('19:45')),
      },
    ],
    provenance: userEntered(utc('19:45')),
  },
]

  const workouts: Workout[] = [
  {
    id: asId<'Workout'>('workout-1') as WorkoutId,
    userId: DEMO_USER_ID,
    type: 'STRENGTH',
    time: { kind: 'interval', start: utc('17:30'), end: utc('18:32'), zone: ZONE },
    duration: canonical(62, 'min'),
    activeEnergy: canonical(410, 'kcal'),
    averageHeartRate: canonical(118, 'bpm'),
    exercises: [
      {
        id: asId<'Exercise'>('ex-bench') as ExerciseId,
        workoutId: asId<'Workout'>('workout-1') as WorkoutId,
        name: 'Bench press',
        sets: [
          { reps: 8, weight: canonical(70, 'kg'), rpe: 7 },
          { reps: 8, weight: canonical(75, 'kg'), rpe: 8 },
          { reps: 6, weight: canonical(80, 'kg'), rpe: 9 },
        ],
      },
      {
        id: asId<'Exercise'>('ex-row') as ExerciseId,
        workoutId: asId<'Workout'>('workout-1') as WorkoutId,
        name: 'Barbell row',
        sets: [
          { reps: 10, weight: canonical(60, 'kg'), rpe: 7 },
          { reps: 10, weight: canonical(60, 'kg'), rpe: 8 },
        ],
      },
    ],
    notes: 'Chest / back',
    provenance: deviceReading('GARMIN', utc('18:32')),
  },
]

  const goals: Goal[] = [
  {
    id: asId<'Goal'>('goal-protein') as GoalId,
    userId: DEMO_USER_ID,
    metric: 'PROTEIN',
    direction: 'AT_LEAST',
    target: canonical(145, 'g'),
    startsOn: addDays(day, -17),
    active: true,
    provenance: userEntered(zonedTimeToUtc(addDays(day, -17), '08:00', zone)),
  },
  {
    id: asId<'Goal'>('goal-steps') as GoalId,
    userId: DEMO_USER_ID,
    metric: 'STEPS',
    direction: 'AT_LEAST',
    target: canonical(10000, 'count'),
    startsOn: addDays(day, -17),
    active: true,
    provenance: userEntered(zonedTimeToUtc(addDays(day, -17), '08:00', zone)),
  },
]

  return { profile, sleep, observations, meals, workouts, goals }
}

/** Fixed sample set on DEMO_DAY, used by tests. */
export const { profile, sleep, observations, meals, workouts, goals } = buildSeed()

/** Clinical entities: shapes are modelled, no screen reads them yet. */
export const labPanels: LabPanel[] = []
export const conditions: Condition[] = []
export const regimens: Regimen[] = []
export const intakeEvents: IntakeEvent[] = []
