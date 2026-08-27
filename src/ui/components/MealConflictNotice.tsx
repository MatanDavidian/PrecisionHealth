import { convert, type Meal, type MealConflict } from '@/domain'
import { sourceLabel } from './ProvenanceBadge'

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
  return (
    <div className="mt-3 rounded-xl border border-accent-soft bg-accent-soft/40 p-3">
      <p className="text-xs font-medium text-accent">
        This meal was edited in two places
      </p>
      <p className="pt-1 text-xs text-ink-muted">
        Both edits started from version {conflict.version - 1}. Pick the one to keep — the other
        stays in your history either way.
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
                {candidate.items.length} item{candidate.items.length === 1 ? '' : 's'}
              </span>
              <span className="tabular text-xs text-ink-muted">
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
              {candidate.items.map((item) => item.name).join(', ') || 'No items'}
              {' · '}
              {sourceLabel(candidate.provenance.source)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
