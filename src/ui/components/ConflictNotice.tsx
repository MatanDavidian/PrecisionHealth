import type { Conflict, Observation } from '@/domain'
import { sourceLabel } from './ProvenanceBadge'
import { showNumber } from '../format'
import type { Unit } from '@/domain'

/**
 * Two sources disagreed by more than the metric's tolerance, so the app asks
 * instead of choosing. Confirming writes a new USER_CONFIRMED record that
 * supersedes the others — the correction is data, not a mutation.
 *
 * The write path lands with slice 1; today this states the disagreement, which
 * is already more honest than silently showing one number.
 */
export function ConflictNotice({
  conflict,
  unit,
  dp = 1,
}: {
  conflict: Conflict<Observation>
  unit: Unit
  dp?: number
}) {
  const { effective, competing } = conflict
  return (
    <div className="mt-3 rounded-xl border border-accent-soft bg-accent-soft/40 p-3">
      <p className="text-xs font-medium text-accent">Two sources disagree</p>
      <p className="pt-1 text-xs text-ink-muted">
        {sourceLabel(effective.provenance.source)} recorded{' '}
        <span className="tabular font-medium text-ink">{showNumber(effective.value, unit, dp)}</span>
        {competing.map((other) => (
          <span key={other.id}>
            , {sourceLabel(other.provenance.source)} recorded{' '}
            <span className="tabular font-medium text-ink">{showNumber(other.value, unit, dp)}</span>
          </span>
        ))}
        . Showing the higher-precedence source until you confirm one.
      </p>
    </div>
  )
}
