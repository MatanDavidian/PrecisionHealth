/**
 * Learning the real burn from the weight (meal-suggestions-precision.md §5.4,
 * Phase 5).
 *
 * If a person logs most of what they eat and weighs in regularly, the weight
 * trend says what they really burn:
 *
 *   real burn ≈ average eaten − (trend change in kg × 7,700) ÷ days
 *
 * The trend is a straight line fitted through the weigh-ins (least squares),
 * not a smoothed series: one salty dinner moves a single weigh-in a kilo and
 * barely moves the line, and unlike smoothing, the line does not lag behind
 * real change, which would read as a burn that is not there.
 *
 * It corrects the one thing no average can: this watch's bias, for this
 * person. Pure; the data layer gathers the days and weigh-ins. Offered only
 * when ALL of these hold (each provisional, to revisit with real data):
 *
 * - 28 days of sufficiently complete data: at least 24 of them logged and
 *   not marked incomplete, and at least 6 weigh-ins, with one in the first
 *   week and one in the last, and at least 3 in each half;
 * - a persistent discrepancy of at least 10%: over the whole span, AND over
 *   each half of it in the same direction, so one odd week cannot do it;
 * - and the person's explicit approval, which the screen asks for. Never
 *   applied silently, and undoable.
 */
import type { CalendarDate } from './time'

/** About what a kilo of body weight change is worth, in kcal. */
export const KCAL_PER_KG = 7700
export const CALIBRATION_DAYS = 28
export const MIN_COMPLETE_DAYS = 24
export const MIN_WEIGH_INS = 6
/** The smallest discrepancy worth offering, both over the span and over each half. */
export const MIN_DISCREPANCY = 0.1
/** A correction is never larger than this, either way: past it, something else is wrong. */
export const MAX_CORRECTION = 0.3
/** Weigh-ins each half of the span needs, so each half has a line of its own. */
export const MIN_WEIGH_INS_PER_HALF = 3
/** After "Not now", the offer waits this long. */
export const DISMISS_DAYS = 14

export interface CalibrationDay {
  day: CalendarDate
  eatenKcal: number
  /** Logged fully enough to count: logged, not marked incomplete, not under half its target unanswered. */
  complete: boolean
  /** The usual burn the targets used that day, a day. */
  usedBurnKcal?: number
}

export interface WeighIn {
  day: CalendarDate
  kg: number
}

export type Calibration =
  | {
      status: 'NOT_ENOUGH'
      /** How far along the data is, for the screen: days complete of 28, weigh-ins of 6. */
      completeDays: number
      weighIns: number
    }
  | { status: 'AGREES'; trendKcal: number; usedKcal: number; discrepancy: number }
  /** More than 30% apart: usually meals missing from the log, not a watch's bias. Nothing offered. */
  | { status: 'UNCLEAR'; trendKcal: number; usedKcal: number; discrepancy: number }
  | { status: 'OFFER'; trendKcal: number; usedKcal: number; discrepancy: number; factor: number }

/** Days between two calendar dates. */
const daysBetween = (a: CalendarDate, b: CalendarDate) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/** The slope of the weigh-ins, in kg a day, by least squares: the trend's line. */
export function weightSlope(weighIns: readonly WeighIn[]): number | undefined {
  if (weighIns.length < 2) return undefined
  const origin = weighIns[0].day
  const xs = weighIns.map((w) => daysBetween(origin, w.day))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = weighIns.reduce((a, w) => a + w.kg, 0) / weighIns.length
  const sxx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0)
  if (sxx === 0) return undefined
  return xs.reduce((sum, x, i) => sum + (x - mx) * (weighIns[i].kg - my), 0) / sxx
}

/** The burn a stretch of days implies: what was eaten, less what the trend says was stored. */
function impliedBurn(
  span: readonly CalibrationDay[],
  weighIns: readonly WeighIn[],
): { trendKcal: number; usedKcal: number } | undefined {
  const keys = new Set(span.map((d) => d.day))
  const slope = weightSlope(weighIns.filter((w) => keys.has(w.day)).sort((a, b) => a.day.localeCompare(b.day)))
  const complete = span.filter((d) => d.complete)
  const used = complete.filter((d) => d.usedBurnKcal !== undefined)
  if (slope === undefined || complete.length === 0 || used.length === 0) return undefined
  const eaten = complete.reduce((sum, d) => sum + d.eatenKcal, 0) / complete.length
  return {
    trendKcal: eaten - slope * KCAL_PER_KG,
    usedKcal: used.reduce((sum, d) => sum + d.usedBurnKcal!, 0) / used.length,
  }
}

/** What the weight trend says about the burn in use, over the last 28 days (oldest first). */
export function burnCalibration(days: readonly CalibrationDay[], weighIns: readonly WeighIn[]): Calibration {
  const span = days.slice(-CALIBRATION_DAYS)
  const keys = new Set(span.map((d) => d.day))
  const inSpan = weighIns.filter((w) => keys.has(w.day))
  const completeDays = span.filter((d) => d.complete).length
  const firstWeek = new Set(span.slice(0, 7).map((d) => d.day))
  const lastWeek = new Set(span.slice(-7).map((d) => d.day))
  const half = Math.floor(span.length / 2)
  const earlyDays = new Set(span.slice(0, half).map((d) => d.day))
  const earlyWeighIns = inSpan.filter((w) => earlyDays.has(w.day)).length
  const enough =
    span.length >= CALIBRATION_DAYS &&
    completeDays >= MIN_COMPLETE_DAYS &&
    inSpan.length >= MIN_WEIGH_INS &&
    inSpan.some((w) => firstWeek.has(w.day)) &&
    inSpan.some((w) => lastWeek.has(w.day)) &&
    earlyWeighIns >= MIN_WEIGH_INS_PER_HALF &&
    inSpan.length - earlyWeighIns >= MIN_WEIGH_INS_PER_HALF
  if (!enough) return { status: 'NOT_ENOUGH', completeDays, weighIns: inSpan.length }

  const whole = impliedBurn(span, inSpan)
  const early = impliedBurn(span.slice(0, half), inSpan)
  const late = impliedBurn(span.slice(half), inSpan)
  if (!whole || !early || !late) return { status: 'NOT_ENOUGH', completeDays, weighIns: inSpan.length }

  const gap = (b: { trendKcal: number; usedKcal: number }) => (b.trendKcal - b.usedKcal) / b.usedKcal
  const discrepancy = gap(whole)
  const persistent =
    Math.abs(discrepancy) >= MIN_DISCREPANCY &&
    Math.abs(gap(early)) >= MIN_DISCREPANCY &&
    Math.abs(gap(late)) >= MIN_DISCREPANCY &&
    Math.sign(gap(early)) === Math.sign(discrepancy) &&
    Math.sign(gap(late)) === Math.sign(discrepancy)
  const rounded = { trendKcal: Math.round(whole.trendKcal / 10) * 10, usedKcal: Math.round(whole.usedKcal / 10) * 10 }
  const d = Math.round(discrepancy * 1000) / 1000
  if (Math.abs(discrepancy) > MAX_CORRECTION) return { status: 'UNCLEAR', ...rounded, discrepancy: d }
  if (!persistent) return { status: 'AGREES', ...rounded, discrepancy: d }
  return {
    status: 'OFFER',
    ...rounded,
    discrepancy: d,
    factor: Math.round((whole.trendKcal / whole.usedKcal) * 100) / 100,
  }
}

/** Whether a "Not now" still holds. */
export const dismissedRecently = (dismissedAt: string | undefined, now: Date): boolean =>
  !!dismissedAt && now.getTime() - Date.parse(dismissedAt) < DISMISS_DAYS * 24 * 3600 * 1000
