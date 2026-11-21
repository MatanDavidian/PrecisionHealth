/**
 * Daily targets: how much to eat in a day, and how the day is going against it.
 *
 * Rules, never a model (D13). A calorie target the AI made up would be a
 * number nobody could check; this one is three lines of arithmetic anyone can
 * redo, and Settings spells every step out.
 *
 * Pure on purpose: no reads, no clock. The data layer gathers the inputs
 * (`src/data/targets.ts`); everything that decides a number is here, where a
 * unit test can pin it. docs/features/daily-targets.md has the reasoning.
 */
import { OBJECTIVE_SHAPE, type Objective } from './objectives'
import type { Sex } from './user'

/** How much a day moves, said the way people say it. Asked only when no watch reports a burn. */
export type ActivityLevel = 'LOW' | 'MODERATE' | 'HIGH'

export const ACTIVITY_LEVELS: readonly ActivityLevel[] = ['LOW', 'MODERATE', 'HIGH']

/**
 * Resting rate to a day's burn. The usual published factors run 1.2 to 1.9;
 * three steps from inside that range, because nobody can tell 1.375 from 1.55
 * about themselves, but everyone knows whether they mostly sit.
 */
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  LOW: 1.3,
  MODERATE: 1.5,
  HIGH: 1.7,
}

export const isActivityLevel = (value: unknown): value is ActivityLevel =>
  typeof value === 'string' && (ACTIVITY_LEVELS as readonly string[]).includes(value)

/** How far back the watch's burn is averaged, and how many of those days it takes to trust it. */
export const BURN_LOOKBACK_DAYS = 28
export const MIN_MEASURED_DAYS = 5

/**
 * Grams of protein per kilo, by what the person is doing.
 *
 * Higher when eating less (protein is what keeps muscle through a deficit) and
 * when building; 1.4 for keeping steady, above the 0.8 floor that is about
 * avoiding deficiency rather than about training.
 */
export const PROTEIN_G_PER_KG: Record<Objective, number> = {
  LOSE_WEIGHT: 1.6,
  LOSE_FAT: 2.0,
  BUILD_MUSCLE: 1.8,
  MAINTAIN: 1.4,
  FITNESS: 1.6,
}

/** Fat's share of the calories. Carbs take what protein and fat leave. */
export const FAT_SHARE = 0.3

/**
 * The least a day's target may be, in kcal.
 *
 * The figures usually given as the floor below which eating should be
 * supervised. Anyone whose sex is not given gets the lower one: the cost of
 * a floor too low is a hungrier day, of one too high a stalled goal, and the
 * first is the one the person can feel and correct.
 */
export const MIN_INTAKE_KCAL = { MALE: 1500, OTHER: 1200 } as const

export const minIntakeKcal = (sex?: Sex): number =>
  sex === 'MALE' ? MIN_INTAKE_KCAL.MALE : MIN_INTAKE_KCAL.OTHER

const round = (value: number, to: number): number => Math.round(value / to) * to

/**
 * Resting energy, Mifflin–St Jeor (1990): the formula dietitians reach for
 * first, within about 10% for most adults.
 *
 * With sex not given, the constant halfway between the two (+5 and −161), so
 * the estimate is off by at most half the difference rather than all of it.
 */
export function restingKcal(input: { weightKg: number; heightCm: number; ageYears: number; sex?: Sex }): number {
  const constant = input.sex === 'MALE' ? 5 : input.sex === 'FEMALE' ? -161 : -78
  return 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears + constant
}

/**
 * The watch's average burn, or undefined when there are too few days to trust.
 *
 * `daily` is one total per day that has one; the caller leaves out the day
 * being shown, which is never finished. An average rather than the latest
 * day: tomorrow's food should not hang on whether today had a long run.
 */
export function measuredBurn(daily: readonly number[]): { kcal: number; days: number } | undefined {
  const usable = daily.filter((kcal) => Number.isFinite(kcal) && kcal > 0)
  if (usable.length < MIN_MEASURED_DAYS) return undefined
  const mean = usable.reduce((sum, kcal) => sum + kcal, 0) / usable.length
  return { kcal: mean, days: usable.length }
}

/** Where the day's burn came from: the watch, or the formula. */
export type BurnBasis =
  | { kind: 'MEASURED'; kcal: number; days: number }
  | { kind: 'ESTIMATED'; kcal: number; restingKcal: number; activity: ActivityLevel }

export interface TargetsInput {
  objective?: Objective
  /** Current weight. */
  weightKg?: number
  /** The target weight, when the goal has one. */
  targetKg?: number
  heightCm?: number
  ageYears?: number
  sex?: Sex
  activity?: ActivityLevel
  /** Daily total burns from before the day, one per day that has one. */
  burnHistory: readonly number[]
  /** A protein goal the person set themselves, in grams. It wins over the rule. */
  proteinGoalG?: number
}

/** What stands between the person and their targets, in the order to fix it. */
export type TargetsMissing = 'OBJECTIVE' | 'WEIGHT' | 'BURN'

export interface DailyTargets {
  objective: Objective
  energyKcal: number
  proteinG: number
  carbsG: number
  fatG: number
  burn: BurnBasis
  /** The objective's daily balance: −350 for losing fat; 0 for fitness, which sets none. */
  balanceKcal: number
  /** True when the floor raised the calories. */
  floored: boolean
  /** Where protein came from: the rule (with the weight it multiplied) or the person's own goal. */
  protein: { from: 'RULE'; perKg: number; weightKg: number } | { from: 'GOAL' }
}

export type TargetsResult = { ok: true; targets: DailyTargets } | { ok: false; missing: TargetsMissing[] }

/** The burn to build on: measured if there is enough of it, else the formula, else nothing. */
export function burnBasis(input: TargetsInput): BurnBasis | undefined {
  const measured = measuredBurn(input.burnHistory)
  if (measured) return { kind: 'MEASURED', ...measured }
  const { weightKg, heightCm, ageYears, activity } = input
  if (weightKg === undefined || heightCm === undefined || ageYears === undefined || !activity) return undefined
  const resting = restingKcal({ weightKg, heightCm, ageYears, sex: input.sex })
  return { kind: 'ESTIMATED', kcal: resting * ACTIVITY_FACTOR[activity], restingKcal: resting, activity }
}

/**
 * The weight protein is counted against.
 *
 * The target weight when losing toward one lower than now, so someone at
 * 120 kg aiming for 90 is asked for 90 kilos' worth rather than an amount
 * nobody eats. Otherwise the weight they are.
 */
export function proteinWeightKg(objective: Objective, weightKg: number, targetKg?: number): number {
  const losing = objective === 'LOSE_WEIGHT' || objective === 'LOSE_FAT'
  return losing && targetKg !== undefined && targetKg < weightKg ? targetKg : weightKg
}

export function dailyTargets(input: TargetsInput): TargetsResult {
  const burn = burnBasis(input)
  const missing: TargetsMissing[] = []
  if (!input.objective) missing.push('OBJECTIVE')
  if (input.weightKg === undefined) missing.push('WEIGHT')
  if (!burn) missing.push('BURN')
  if (!input.objective || input.weightKg === undefined || !burn) return { ok: false, missing }

  const objective = input.objective
  const balanceKcal = OBJECTIVE_SHAPE[objective].dailyKcal ?? 0
  const floor = minIntakeKcal(input.sex)
  const wanted = round(burn.kcal + balanceKcal, 10)
  const energyKcal = Math.max(wanted, floor)

  const perKg = PROTEIN_G_PER_KG[objective]
  const basisKg = proteinWeightKg(objective, input.weightKg, input.targetKg)
  const proteinG =
    input.proteinGoalG !== undefined && input.proteinGoalG > 0
      ? Math.round(input.proteinGoalG)
      : round(perKg * basisKg, 5)
  const fatG = round((energyKcal * FAT_SHARE) / 9, 5)
  const carbsG = Math.max(0, round((energyKcal - proteinG * 4 - fatG * 9) / 4, 5))

  return {
    ok: true,
    targets: {
      objective,
      energyKcal,
      proteinG,
      carbsG,
      fatG,
      burn,
      balanceKcal,
      floored: energyKcal > wanted,
      protein:
        input.proteinGoalG !== undefined && input.proteinGoalG > 0
          ? { from: 'GOAL' }
          : { from: 'RULE', perKg, weightKg: basisKg },
    },
  }
}

/** Within this share of the calorie target, either way, the day is on target. */
export const ON_TARGET_SHARE = 0.05

export type CalorieState = 'UNDER' | 'ON_TARGET' | 'OVER'
export type ProteinState = 'UNDER' | 'REACHED'

export interface NutrientProgress {
  eaten: number
  target: number
  /** How much of the target is eaten, 0 upward; past 1 is over. */
  share: number
  /** Target minus eaten: positive is left to eat, negative is over. */
  remaining: number
}

const progressOf = (eaten: number, target: number): NutrientProgress => ({
  eaten,
  target,
  share: target > 0 ? eaten / target : 0,
  remaining: target - eaten,
})

export interface DayProgress {
  energy: NutrientProgress & { state: CalorieState }
  protein: NutrientProgress & { state: ProteinState }
  carbs: NutrientProgress
  fat: NutrientProgress
}

/**
 * The day against its targets.
 *
 * Calories are aimed at, so both sides of the target count and a band around
 * it is "on target". Protein is a floor: reaching it is the whole point. Carbs
 * and fat carry no verdict; they are where the rest of the day goes.
 */
export function dayProgress(
  targets: Pick<DailyTargets, 'energyKcal' | 'proteinG' | 'carbsG' | 'fatG'>,
  eaten: { energyKcal: number; proteinG: number; carbsG: number; fatG: number },
): DayProgress {
  const energy = progressOf(eaten.energyKcal, targets.energyKcal)
  const band = targets.energyKcal * ON_TARGET_SHARE
  const energyState: CalorieState =
    Math.abs(energy.remaining) <= band ? 'ON_TARGET' : energy.remaining > 0 ? 'UNDER' : 'OVER'
  const protein = progressOf(eaten.proteinG, targets.proteinG)
  return {
    energy: { ...energy, state: energyState },
    protein: { ...protein, state: eaten.proteinG >= targets.proteinG ? 'REACHED' : 'UNDER' },
    carbs: progressOf(eaten.carbsG, targets.carbsG),
    fat: progressOf(eaten.fatG, targets.fatG),
  }
}

/** Age in whole years on a day, from a year of birth. A year is all that is asked, so this can be a year out. */
export const ageOn = (day: string, birthYear: number): number => Number(day.slice(0, 4)) - birthYear
