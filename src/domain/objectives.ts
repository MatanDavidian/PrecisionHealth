/**
 * What the user is actually trying to do.
 *
 * A target weight says where you want to end up; it says nothing about how, and
 * "75 kg" is the same number whether you are cutting hard or slowly recomposing.
 * An objective is the *programme* — and the daily energy balance it implies is
 * what makes a week gradeable at all.
 *
 * Deliberately five, and deliberately coarse. A slider from −1000 to +1000 would
 * be more expressive and would ask a question nobody can answer about
 * themselves; these are the five intents people actually hold, each with a rate
 * that is defensible rather than optimal.
 */
export type Objective = 'LOSE_WEIGHT' | 'LOSE_FAT' | 'BUILD_MUSCLE' | 'MAINTAIN' | 'FITNESS'

export const OBJECTIVES: readonly Objective[] = [
  'LOSE_WEIGHT',
  'LOSE_FAT',
  'BUILD_MUSCLE',
  'MAINTAIN',
  'FITNESS',
]

export interface ObjectiveShape {
  /**
   * The daily energy balance this aims for, in kcal — negative for a deficit.
   *
   * `null` means the objective has no calorie target at all, which is a real
   * answer rather than zero: "eat what you burn" and "I am not counting" grade
   * completely differently.
   */
  dailyKcal: number | null
  /** Whether a target weight belongs to this programme. */
  wantsTarget: boolean
}

/**
 * The rates. 500 kcal a day is roughly half a kilo a week, the number every
 * dietician starts from; 350 is the gentler version that costs less muscle;
 * 250 is a surplus small enough that most of it can be lean.
 */
export const OBJECTIVE_SHAPE: Record<Objective, ObjectiveShape> = {
  LOSE_WEIGHT: { dailyKcal: -500, wantsTarget: true },
  LOSE_FAT: { dailyKcal: -350, wantsTarget: true },
  BUILD_MUSCLE: { dailyKcal: 250, wantsTarget: true },
  MAINTAIN: { dailyKcal: 0, wantsTarget: false },
  FITNESS: { dailyKcal: null, wantsTarget: false },
}

export const isObjective = (value: unknown): value is Objective =>
  typeof value === 'string' && (OBJECTIVES as readonly string[]).includes(value)

/** Eaten against burned over a stretch of days. Negative net is a deficit. */
export interface EnergyBalance {
  eatenKcal: number
  burnedKcal: number
  /** eaten − burned. Negative means you burned more than you ate. */
  netKcal: number
}

export const balanceOf = (eatenKcal: number, burnedKcal: number): EnergyBalance => ({
  eatenKcal,
  burnedKcal,
  netKcal: eatenKcal - burnedKcal,
})

export type Verdict = 'ON_TRACK' | 'OFF_TARGET' | 'UNGRADED'

/** How close a week has to be to "level" before it counts. 100 kcal a day. */
export const LEVEL_TOLERANCE_KCAL = 700

/**
 * Whether a week met what the objective asked of it.
 *
 * Asymmetric on purpose. A deficit target is a ceiling — going further under it
 * is not a failure, it is a harder week — so only overshooting counts against
 * you. A surplus is the mirror. Only "keep this weight" is graded in both
 * directions, because there both errors are the same error.
 *
 * An objective with no calorie target is UNGRADED rather than passed: the
 * balance is context, and scoring someone against a target they never set would
 * be inventing one for them.
 */
export function verdictFor(netKcal: number, weekAimKcal: number | null): Verdict {
  if (weekAimKcal === null) return 'UNGRADED'
  const gap = netKcal - weekAimKcal
  if (weekAimKcal < 0) return gap <= 0 ? 'ON_TRACK' : 'OFF_TARGET'
  if (weekAimKcal > 0) return gap >= 0 ? 'ON_TRACK' : 'OFF_TARGET'
  return Math.abs(gap) < LEVEL_TOLERANCE_KCAL ? 'ON_TRACK' : 'OFF_TARGET'
}

/** The whole week's aim, or null when the objective sets no calorie target. */
export const weekAimKcal = (objective: Objective, days = 7): number | null => {
  const daily = OBJECTIVE_SHAPE[objective].dailyKcal
  return daily === null ? null : daily * days
}

/** How far off the aim a week landed. Zero when there is nothing to grade. */
export const weekGapKcal = (netKcal: number, aim: number | null): number =>
  aim === null ? 0 : netKcal - aim


/**
 * How far a week has to drift before it is worth mentioning without a target.
 *
 * Roughly half a kilogram's worth of energy. Below it, a week's imbalance is
 * noise — logging gaps, a heavy meal, a rest day — and calling it out would
 * train someone to ignore the app. Above it, something is actually happening.
 */
export const NOTABLE_DRIFT_KCAL = 3500

/**
 * A remark for a goal that sets no calorie target.
 *
 * `FITNESS` is deliberately UNGRADED: scoring someone against a target they
 * never set is inventing one for them, and that stays true. But "you are not
 * being scored" is not the same as "nothing here is worth knowing", and eating
 * four thousand more than you burned in a week is worth knowing whatever you
 * told the app you were doing.
 *
 * So this is an observation, not a verdict — it never says on track or off
 * target, and it stays quiet until the number is large enough to mean
 * something.
 */
export type Drift = { direction: 'OVER' | 'UNDER'; kcal: number } | undefined

export function driftOf(netKcal: number, aimKcal: number | null): Drift {
  // A graded week already has a verdict; a second opinion beside it would be
  // noise at best and a contradiction at worst.
  if (aimKcal !== null) return undefined
  if (Math.abs(netKcal) < NOTABLE_DRIFT_KCAL) return undefined
  return { direction: netKcal > 0 ? 'OVER' : 'UNDER', kcal: Math.round(Math.abs(netKcal)) }
}
