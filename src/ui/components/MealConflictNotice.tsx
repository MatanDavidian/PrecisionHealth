import { convert, type Meal, type MealConflict } from '@/domain'
import { sourceKey } from './ProvenanceBadge'
import { useT } from '../i18n'

/**
 * Two devices edited the same meal from the same base version (D15).
 *
 * The same shape as the observation conflict card, deliberately: the app has
 * one way of saying "these disagree, you decide", whether the subject is a
 * weight reading or a plate of food.
 */
export function MealConflictNotice({
  conflict,
  onChoose,
}: {
  conflict: MealConflict
  onChoose: (chosen: Meal) => void
}) {
  const t = useT()
  return (
    <div className="mt-3 rounded-xl border border-accent-soft bg-accent-soft/40 p-3">
      <p className="text-xs font-medium text-accent">{t('conflict.mealTwoPlaces')}</p>
      <p className="pt-1 text-xs text-ink-muted">
        {t('conflict.mealBoth', { version: conflict.version - 1 })}
      </p>

      <div className="space-y-2 pt-2">
        {conflict.candidates.map((candidate) => (
          <button
            key={candidate.recordId}
            type="button"
            onClick={() => onChoose(candidate)}
            className="block w-full rounded-lg border border-hairline bg-surface p-2 text-start transition-colors hover:bg-card-soft"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium">
                {t('conflict.itemCount', { count: candidate.items.length })}
              </span>
              <span className="tabular ltr-nums text-xs text-ink-muted">
                {Math.round(
                  candidate.items.reduce(
                    (sum, item) => sum + convert(item.nutrients.energy, 'kcal'),
                    0,
                  ),
                )}{' '}
                kcal
              </span>
            </span>
            <span className="block truncate pt-0.5 text-xs text-ink-muted">
              {candidate.items.map((item) => item.name).join(', ') || t('conflict.noItems')}
              {' · '}
              {t(sourceKey(candidate.provenance.source))}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
