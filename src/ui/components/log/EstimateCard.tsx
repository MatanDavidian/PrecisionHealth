import type { EstimateResult } from '@/ai/estimator'
import { Card } from '../Card'

/**
 * What the model came back with, whatever it was shown.
 *
 * One card for photo and text on purpose. The numbers mean the same thing and
 * are settled the same way; the only honest difference is how sure they are,
 * and that is already on screen as a confidence pill per item — plus one line
 * saying a written meal was never seen.
 */
export function EstimateCard({
  result,
  downgraded,
  fromText,
  saving,
  onSave,
  onDiscard,
}: {
  result: EstimateResult
  downgraded?: boolean
  /** Set for an estimate from words, which is honestly the weaker of the two. */
  fromText?: boolean
  saving?: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  if (result.refusal) {
    return (
      <Card>
        <p className="text-sm">{result.refusal}</p>
        <button
          type="button"
          onClick={onDiscard}
          className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm"
        >
          {fromText ? 'Describe something else' : 'Try another photo'}
        </button>
      </Card>
    )
  }

  const total = result.items.reduce(
    (sum, item) => ({
      kcal: sum.kcal + item.energyKcal,
      protein: sum.protein + item.proteinG,
      carbs: sum.carbs + item.carbsG,
      fat: sum.fat + item.fatG,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const lowConfidence = result.overallConfidence < 0.5

  return (
    <div className="pt-4">
      <Card label={fromText ? 'Estimate from your words' : 'Estimate'}>
        <div className="flex flex-wrap gap-x-6 gap-y-2 pb-3">
          <Figure name="Calories" value={Math.round(total.kcal).toLocaleString()} />
          <Figure name="Protein" value={`${Math.round(total.protein)} g`} />
          <Figure name="Carbs" value={`${Math.round(total.carbs)} g`} />
          <Figure name="Fat" value={`${Math.round(total.fat)} g`} />
        </div>

        {result.items.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="flex flex-wrap items-baseline justify-between gap-2 border-t border-hairline py-2"
          >
            <span className="text-sm">
              {item.name}
              <span className="text-ink-muted">
                {' '}
                · {fromText ? 'assumed ' : ''}
                {Math.round(item.amountG)} g
              </span>
            </span>
            <span className="flex items-baseline gap-3">
              <span className="tabular text-xs text-ink-muted">
                {Math.round(item.proteinG)}P · {Math.round(item.carbsG)}C · {Math.round(item.fatG)}F
              </span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent">
                {Math.round(item.confidence * 100)}%
              </span>
            </span>
          </div>
        ))}

        {result.assumptions.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 pt-3 text-xs text-ink-muted">
            {result.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        )}

        {fromText && (
          <p className="pt-3 text-xs text-ink-muted">
            Confidence is lower than a photo's — nothing was seen, so portions were assumed.
          </p>
        )}

        {lowConfidence && (
          <p className="pt-3 text-xs text-accent">
            Low confidence — worth checking the numbers before you trust them.
          </p>
        )}

        {downgraded && (
          <p className="pt-3 text-xs text-accent">
            Read by the quicker model — your most-accurate analyses are used up.
          </p>
        )}

        <p className="pt-3 text-xs text-ink-muted">
          Saved as an estimate you can confirm, correct or delete in Nutrition.
        </p>

        <div className="flex flex-wrap gap-3 pt-4">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save meal'}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            Discard
          </button>
        </div>
      </Card>
    </div>
  )
}

function Figure({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {name}
      </p>
      <p className="tabular pt-0.5 text-lg font-medium">{value}</p>
    </div>
  )
}
