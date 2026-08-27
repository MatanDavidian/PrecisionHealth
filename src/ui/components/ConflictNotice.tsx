import type { Conflict, Observation, Unit } from '@/domain'
import { sourceKey } from './ProvenanceBadge'
import { showNumber } from '../format'
import { useT } from '../i18n'

/**
 * Two sources disagreed by more than the metric's tolerance, so the app asks
 * instead of choosing (D6). Picking writes a new USER_CONFIRMED record that
 * supersedes every candidate — the correction is data, not a mutation, and the
 * original device readings stay in history.
 */
export function ConflictNotice({
  conflict,
  unit,
  dp = 1,
  onChoose,
}: {
  conflict: Conflict<Observation>
  unit: Unit
  dp?: number
  onChoose: (chosen: Observation) => void
}) {
  const t = useT()
  const options = [conflict.effective, ...conflict.competing]

  return (
    <div className="mt-3 rounded-xl border border-accent-soft bg-accent-soft/40 p-3">
      <p className="text-xs font-medium text-accent">{t('conflict.twoSources')}</p>
      <p className="pt-1 text-xs text-ink-muted">
        {t('conflict.showing', { source: t(sourceKey(conflict.effective.provenance.source)) })}
      </p>
      <div className="flex flex-wrap gap-2 pt-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChoose(option)}
            className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs transition-colors hover:bg-card-soft"
          >
            <span className="tabular ltr-nums font-medium">
              {showNumber(option.value, unit, dp)}
            </span>{' '}
            <span className="text-ink-muted">{t(sourceKey(option.provenance.source))}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
