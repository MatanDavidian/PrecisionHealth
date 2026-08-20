/**
 * Display formatting — the only place canonical values turn back into the
 * units a human reads. Storage stays canonical; conversion happens here.
 */
import { convert, type CanonicalQuantity, type Unit } from '@/domain'

const round = (n: number, dp: number) => Number(n.toFixed(dp))

export const show = (q: CanonicalQuantity, unit: Unit, dp = 0): string =>
  `${round(convert(q, unit), dp).toLocaleString()} ${unit}`

export const showNumber = (q: CanonicalQuantity, unit: Unit, dp = 0): string =>
  round(convert(q, unit), dp).toLocaleString()

/** Seconds -> "7h 32m". */
export const showDuration = (q: CanonicalQuantity): string => {
  const totalMinutes = Math.round(convert(q, 'min'))
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
}
