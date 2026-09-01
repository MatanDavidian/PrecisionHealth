import type { EstimateResult } from '@/ai/estimator'
import { correctsAnything, type EstimateCorrection } from '@/data/estimatedMeal'
import { Card } from '../Card'
import { useT } from '../../i18n'

/**
 * What the model came back with, whatever it was shown.
 *
 * One card for photo and text on purpose. The numbers mean the same thing and
 * are settled the same way; the only honest difference is how sure they are,
 * and that is already on screen as a confidence pill per item — plus one line
 * saying a written meal was never seen.
 *
 * The numbers are editable in place, because the moment you are most likely to
 * know an estimate is wrong is the moment you are looking at it next to the
 * food. Saving a number you can already see is wrong, in order to correct it on
 * another screen afterwards, is not a workflow anybody would choose.
 */
export function EstimateCard({
  result,
  downgraded,
  fromText,
  saving,
  onSave,
  onDiscard,
  rows,
  onAdjust,
  saveLabel,
}: {
  result: EstimateResult
  downgraded?: boolean
  /** Set for an estimate from words, which is honestly the weaker of the two. */
  fromText?: boolean
  saving?: boolean
  /** Corrections are passed back so the caller can record what was overridden. */
  onSave: (corrections?: EstimateCorrection[]) => void
  onDiscard: () => void
  /** The rows as they currently stand, owned by the screen so Adjust can share them. */
  rows: EstimateCorrection[]
  /** Opens the adjust screen. */
  onAdjust: () => void
  /**
   * Overrides the save button's text.
   *
   * On the Log screen the destination is obvious — you are standing in it. Used
   * from the day view it is not, so the button says which day it is adding to.
   */
  saveLabel?: string
}) {
  const t = useT()
  if (result.refusal) {
    return (
      <Card>
        <p className="text-sm">{result.refusal}</p>
        <button
          type="button"
          onClick={onDiscard}
          className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm"
        >
          {fromText ? t('estimate.describeSomethingElse') : t('estimate.tryAnotherPhoto')}
        </button>
      </Card>
    )
  }


  const kept = rows.filter((row) => !row.removed)
  const corrected = correctsAnything(result, rows)
  const shown = kept

  const total = shown.reduce(
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
      <Card label={fromText ? t('estimate.labelFromText') : t('estimate.label')}>
        <div className="flex flex-wrap gap-x-6 gap-y-2 pb-3">
          <Figure name={t('estimate.calories')} value={Math.round(total.kcal).toLocaleString()} />
          <Figure name={t('estimate.protein')} value={`${Math.round(total.protein)} g`} />
          <Figure name={t('estimate.carbs')} value={`${Math.round(total.carbs)} g`} />
          <Figure name={t('estimate.fat')} value={`${Math.round(total.fat)} g`} />
        </div>

        {shown.map((row) => {
          const item = result.items[row.index]
          const wasChanged = item !== undefined && correctsAnything(result, [row])
          return (
            <div
              key={row.index}
              className="flex flex-wrap items-baseline justify-between gap-2 border-t border-hairline py-2"
            >
              <span className="text-sm" dir="auto">
                {row.name}
                <span className="text-ink-muted">
                  {' '}
                  · {fromText && !wasChanged ? `${t('estimate.assumed')} ` : ''}
                  {Math.round(row.amountG)} g
                </span>
              </span>
              <span className="flex items-baseline gap-3">
                {/* Pinned LTR: bidi would otherwise reorder the pieces around
                    the separators and make this unreadable. */}
                <span className="tabular ltr-nums text-xs text-ink-muted">
                  {Math.round(row.proteinG)}P · {Math.round(row.carbsG)}C ·{' '}
                  {Math.round(row.fatG)}F
                </span>
                {wasChanged ? (
                  <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[0.65rem] font-medium text-leaf">
                    {t('estimate.yours')}
                  </span>
                ) : (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent">
                    {Math.round((item?.confidence ?? 0) * 100)}%
                  </span>
                )}
              </span>
            </div>
          )
        })}

        {/*
          Adjusting is a screen of its own, not a mode this card slips into.
          The numbers there get a stepper each and the whole width to sit in,
          which a card already carrying totals, assumptions and two buttons
          cannot give them.
        */}
        <button
          type="button"
          onClick={onAdjust}
          className="pt-3 text-xs text-ink-muted underline"
        >
          {corrected ? t('estimate.adjustAgain') : t('estimate.adjust')}
        </button>

        {result.assumptions.length > 0 && (
          <ul className="list-disc space-y-0.5 ps-4 pt-3 text-xs text-ink-muted">
            {result.assumptions.map((assumption) => (
              <li key={assumption} dir="auto">
                {assumption}
              </li>
            ))}
          </ul>
        )}

        {fromText && (
          <p className="pt-3 text-xs text-ink-muted">
            {t('estimate.fromTextNote')}
          </p>
        )}

        {lowConfidence && (
          <p className="pt-3 text-xs text-accent">
            {t('estimate.lowConfidence')}
          </p>
        )}

        {downgraded && (
          <p className="pt-3 text-xs text-accent">
            {t('estimate.downgraded')}
          </p>
        )}

        {kept.length === 0 && (
          <p className="pt-3 text-sm text-accent">{t('estimate.allRemoved')}</p>
        )}

        <p className="pt-3 text-xs text-ink-muted">
          {corrected ? t('estimate.savedNoteCorrected') : t('estimate.savedNote')}
        </p>

        <div className="flex flex-wrap gap-3 pt-4">
          <button
            type="button"
            onClick={() => onSave(corrected ? rows : undefined)}
            disabled={saving || kept.length === 0}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            {saving ? t('estimate.saving') : (saveLabel ?? t('estimate.save'))}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {t('estimate.discard')}
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
      {/* "64 g" must not be reordered to "g 64" by an RTL paragraph. */}
      <p className="tabular ltr-nums pt-0.5 text-lg font-medium">{value}</p>
    </div>
  )
}
