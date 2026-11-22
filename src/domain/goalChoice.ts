/**
 * What a person is working towards, asked as two questions
 * (docs/features/several-goals.md, revised 2026-11-22):
 *
 *   1. Your weight: one of lose, keep, gain, or no weight goal.
 *   2. Also working on: any of building muscle, lowering body fat, and
 *      general fitness.
 *
 * Asked this way, no combination contradicts itself. The five goals the
 * rest of the app knows (objectives.ts) are derived from the answer, so the
 * week, its grading and every goal saved before keep meaning what they did.
 */
import type { Objective } from './objectives'

export type WeightAim = 'LOSE' | 'KEEP' | 'GAIN' | 'NONE'
export type Focus = 'MUSCLE' | 'FAT' | 'FITNESS'

export const WEIGHT_AIMS: readonly WeightAim[] = ['LOSE', 'KEEP', 'GAIN', 'NONE']
export const FOCUSES: readonly Focus[] = ['MUSCLE', 'FAT', 'FITNESS']

export interface GoalChoice {
  aim: WeightAim
  focus: Focus[]
}

export const isWeightAim = (value: unknown): value is WeightAim =>
  typeof value === 'string' && (WEIGHT_AIMS as readonly string[]).includes(value)

const cleanFocus = (focus: readonly unknown[] | undefined): Focus[] =>
  FOCUSES.filter((f) => (focus ?? []).includes(f))

/**
 * The goal whose daily balance the calories and the week follow.
 *
 * Losing while building muscle or lowering body fat is "lose fat, keep
 * muscle" (a gentler deficit); keeping weight, whatever else, is level;
 * gaining is the small surplus; no weight goal is a guide, never graded.
 */
export function leadObjective(choice: GoalChoice): Objective {
  switch (choice.aim) {
    case 'LOSE':
      return choice.focus.includes('MUSCLE') || choice.focus.includes('FAT') ? 'LOSE_FAT' : 'LOSE_WEIGHT'
    case 'KEEP':
      return 'MAINTAIN'
    case 'GAIN':
      return 'BUILD_MUSCLE'
    case 'NONE':
      return 'FITNESS'
  }
}

/**
 * Grams of protein per kilo.
 *
 * By the weight aim, raised by what else is chosen: lowering body fat asks
 * for 2.0 whatever the weight does (protein is what keeps the muscle while
 * the fat goes); building muscle for 1.8, and 2.0 while losing; general
 * fitness for 1.6.
 */
export function proteinPerKg(choice: GoalChoice): number {
  const base: Record<WeightAim, number> = { LOSE: 1.6, KEEP: 1.4, GAIN: 1.8, NONE: 1.6 }
  let rate = base[choice.aim]
  if (choice.focus.includes('MUSCLE')) rate = Math.max(rate, choice.aim === 'LOSE' ? 2.0 : 1.8)
  if (choice.focus.includes('FAT')) rate = Math.max(rate, 2.0)
  if (choice.focus.includes('FITNESS')) rate = Math.max(rate, 1.6)
  return rate
}

/** Whether a target weight belongs to the choice: only when the weight is meant to move. */
export const wantsTargetWeight = (choice: GoalChoice | undefined): boolean =>
  choice?.aim === 'LOSE' || choice?.aim === 'GAIN'

/**
 * The choice a saved goal stands for, whichever way it was saved:
 * - since 2026-11-22: the two answers, as they were given
 * - for a day before that: several of the five goals at once
 * - before that: one of the five
 */
export function goalChoiceOf(goal: { choice?: unknown; objectives?: Objective[]; objective?: Objective } | undefined): GoalChoice | undefined {
  const saved = goal?.choice as Partial<GoalChoice> | undefined
  if (saved && isWeightAim(saved.aim)) return { aim: saved.aim, focus: cleanFocus(saved.focus) }
  const objectives = goal?.objectives?.length ? goal.objectives : goal?.objective ? [goal.objective] : []
  return choiceFromObjectives(objectives)
}

/** One or several of the five goals, read as the two answers. */
export function choiceFromObjectives(objectives: readonly Objective[]): GoalChoice | undefined {
  const has = (o: Objective) => objectives.includes(o)
  if (objectives.length === 0) return undefined
  // "Lose fat, keep muscle" was losing while lowering body fat.
  const focus = cleanFocus([has('BUILD_MUSCLE') && 'MUSCLE', has('LOSE_FAT') && 'FAT', has('FITNESS') && 'FITNESS'])
  if (has('LOSE_WEIGHT') || has('LOSE_FAT')) return { aim: 'LOSE', focus }
  if (has('MAINTAIN')) return { aim: 'KEEP', focus }
  // Building muscle on its own was the small surplus: gaining.
  if (has('BUILD_MUSCLE')) return { aim: 'GAIN', focus }
  return { aim: 'NONE', focus }
}
