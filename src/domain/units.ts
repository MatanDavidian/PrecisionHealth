/**
 * Units.
 *
 * DECISION: one canonical unit per dimension is stored; everything else is a
 * display or input concern. Conversion happens at the edges only.
 *
 * The canonical form is a *branded* type, so a plain Quantity cannot be stored
 * by accident — the compiler rejects it. This is the difference between a
 * convention (which erodes) and an invariant (which cannot).
 */

export type MassUnit = 'g' | 'kg' | 'mg' | 'lb'
export type LengthUnit = 'cm' | 'm' | 'km' | 'in'
export type EnergyUnit = 'kcal' | 'kJ'
export type DurationUnit = 's' | 'min' | 'h'
export type ScalarUnit = 'bpm' | 'ms' | '%' | 'count' | 'mmol/L' | 'mg/dL' | 'score'

export type Unit = MassUnit | LengthUnit | EnergyUnit | DurationUnit | ScalarUnit

/** A number with a unit, as entered or as displayed. */
export interface Quantity<U extends Unit = Unit> {
  value: number
  unit: U
}

export const quantity = <U extends Unit>(value: number, unit: U): Quantity<U> => ({ value, unit })

/**
 * The stored form. `__canonical` is a phantom marker — it exists only in the
 * type system and is never serialized.
 */
export type CanonicalUnit = 'g' | 'cm' | 'kcal' | 's' | ScalarUnit

export interface CanonicalQuantity<U extends CanonicalUnit = CanonicalUnit> {
  value: number
  unit: U
  readonly __canonical: true
}

/** Multiplier into the canonical unit of the same dimension. */
const TO_CANONICAL: Record<Unit, { unit: CanonicalUnit; factor: number }> = {
  // mass -> g
  g: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  mg: { unit: 'g', factor: 0.001 },
  lb: { unit: 'g', factor: 453.59237 },
  // length -> cm
  cm: { unit: 'cm', factor: 1 },
  m: { unit: 'cm', factor: 100 },
  km: { unit: 'cm', factor: 100_000 },
  in: { unit: 'cm', factor: 2.54 },
  // energy -> kcal
  kcal: { unit: 'kcal', factor: 1 },
  kJ: { unit: 'kcal', factor: 1 / 4.184 },
  // duration -> s
  s: { unit: 's', factor: 1 },
  min: { unit: 's', factor: 60 },
  h: { unit: 's', factor: 3600 },
  // dimensionless / already canonical
  bpm: { unit: 'bpm', factor: 1 },
  ms: { unit: 'ms', factor: 1 },
  '%': { unit: '%', factor: 1 },
  count: { unit: 'count', factor: 1 },
  'mmol/L': { unit: 'mmol/L', factor: 1 },
  'mg/dL': { unit: 'mg/dL', factor: 1 },
  score: { unit: 'score', factor: 1 },
}

/** The only way to produce a storable value. */
export function toCanonical(q: Quantity): CanonicalQuantity {
  const rule = TO_CANONICAL[q.unit]
  return { value: q.value * rule.factor, unit: rule.unit, __canonical: true } as CanonicalQuantity
}

/** Shorthand for literals: `canonical(72.8, 'kg')` -> 72800 g. */
export const canonical = (value: number, unit: Unit): CanonicalQuantity => toCanonical({ value, unit })

/** Convert a stored value back out for display. Rounding is the caller's choice. */
export function convert(q: CanonicalQuantity, target: Unit): number {
  const rule = TO_CANONICAL[target]
  if (rule.unit !== q.unit) {
    throw new Error(`Cannot convert ${q.unit} to ${target}: different dimensions`)
  }
  return q.value / rule.factor
}
