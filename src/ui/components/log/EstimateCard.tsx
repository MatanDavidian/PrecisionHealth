import { useState } from 'react'
import type { EstimateResult } from '@/ai/estimator'
import { scaleTo } from '@/domain'
import {
  correctionsFrom,
  correctsAnything,
  type EstimateCorrection,
} from '@/data/estimatedMeal'
import { Card } from '../Card'
import { NumberField, fieldClass, labelClass } from '../NumberField'
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
  onAnswer,
}: {
  result: EstimateResult
  downgraded?: boolean
  /** Set for an estimate from words, which is honestly the weaker of the two. */
  fromText?: boolean
  saving?: boolean
  /** Corrections are passed back so the caller can record what was overridden. */
  onSave: (corrections?: EstimateCorrection[]) => void
  onDiscard: () => void
  /** Absent once the follow-up allowance is spent; the question then stops being offered. */
  onAnswer?: (answer: string) => void
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

  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<EstimateCorrection[]>(() => correctionsFrom(result))
  /** Which rows moved on their own because their weight changed. */
  const [scaled, setScaled] = useState<number[]>([])
  const [answer, setAnswer] = useState('')
  /** Dismissing the question is per-question, so a second one still gets asked. */
  const [skipped, setSkipped] = useState<string>()

  const kept = rows.filter((row) => !row.removed)
  const corrected = correctsAnything(result, rows)
  /** What is on screen: the model's numbers, or the user's corrections of them. */
  const shown = editing || corrected ? kept : correctionsFrom(result)

  const update = (index: number, patch: Partial<EstimateCorrection>) =>
    setRows((current) =>
      current.map((row) => (row.index === index ? { ...row, ...patch } : row)),
    )

  /** Changing the weight carries the numbers with it, and says which ones moved. */
  const reportion = (index: number, amountG: number) => {
    setRows((current) =>
      current.map((row) => (row.index === index ? scaleTo(row, amountG) : row)),
    )
    setScaled((current) => (current.includes(index) ? current : [...current, index]))
  }

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
        {/*
          The question sits above the numbers because it is the one thing here
          that expires — but it is phrased so that ignoring it is obviously
          allowed. The estimate below is complete either way; answering only
          makes it firmer, and the model was told never to withhold one.
        */}
        {result.question && onAnswer && skipped !== result.question && (
          <div className="mb-4 rounded-card border border-hairline bg-surface p-4">
            <p className="text-sm font-medium" dir="auto">
              {result.question}
            </p>
            <p className="pt-1 text-xs text-ink-muted">{t('estimate.question.hint')}</p>
            <form
              className="flex flex-wrap items-center gap-2 pt-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!answer.trim()) return
                onAnswer(answer)
                setAnswer('')
              }}
            >
              <input
                className={`${fieldClass} min-w-0 flex-1`}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t('estimate.question.placeholder')}
                aria-label={t('estimate.question.label')}
              />
              <button
                type="submit"
                disabled={!answer.trim()}
                className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
              >
                {t('estimate.question.send')}
              </button>
              <button
                type="button"
                onClick={() => setSkipped(result.question)}
                className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
              >
                {t('estimate.question.skip')}
              </button>
            </form>
          </div>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-2 pb-3">
          <Figure name={t('estimate.calories')} value={Math.round(total.kcal).toLocaleString()} />
          <Figure name={t('estimate.protein')} value={`${Math.round(total.protein)} g`} />
          <Figure name={t('estimate.carbs')} value={`${Math.round(total.carbs)} g`} />
          <Figure name={t('estimate.fat')} value={`${Math.round(total.fat)} g`} />
        </div>

        {editing
          ? rows.map((row) => {
              const item = result.items[row.index]
              const gone = Boolean(row.removed)
              return (
                <div
                  key={row.index}
                  className={`border-t border-hairline py-3 ${gone ? 'opacity-50' : ''}`}
                >
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-4">
                      <label className={labelClass} htmlFor={`e-name-${row.index}`}>
                        {t('estimate.food')}
                      </label>
                      <input
                        id={`e-name-${row.index}`}
                        className={fieldClass}
                        value={row.name}
                        disabled={gone}
                        onChange={(e) => update(row.index, { name: e.target.value })}
                      />
                    </div>
                    <NumberField
                      id={`e-grams-${row.index}`}
                      label={t('estimate.grams')}
                      value={row.amountG}
                      disabled={gone}
                      highlight={scaled.includes(row.index)}
                      onChange={(amountG) => reportion(row.index, amountG)}
                    />
                    <NumberField
                      id={`e-kcal-${row.index}`}
                      label={t('estimate.calories')}
                      value={row.energyKcal}
                      disabled={gone}
                      onChange={(energyKcal) => update(row.index, { energyKcal })}
                    />
                    <NumberField
                      id={`e-protein-${row.index}`}
                      label={t('estimate.proteinG')}
                      value={row.proteinG}
                      disabled={gone}
                      onChange={(proteinG) => update(row.index, { proteinG })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <NumberField
                        id={`e-carbs-${row.index}`}
                        label={t('estimate.carbsG')}
                        value={row.carbsG}
                        disabled={gone}
                        onChange={(carbsG) => update(row.index, { carbsG })}
                      />
                      <NumberField
                        id={`e-fat-${row.index}`}
                        label={t('estimate.fatG')}
                        value={row.fatG}
                        disabled={gone}
                        onChange={(fatG) => update(row.index, { fatG })}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-baseline justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => update(row.index, { removed: !gone })}
                      className="text-xs text-ink-muted underline"
                    >
                      {gone ? t('estimate.keepFood') : t('estimate.removeFood')}
                    </button>
                    {item && (
                      <span className="text-xs text-ink-muted">
                        {t('estimate.modelSaid', {
                          grams: Math.round(item.amountG),
                          kcal: Math.round(item.energyKcal),
                        })}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          : shown.map((row) => {
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
                    {/* Pinned LTR: bidi would otherwise reorder the pieces
                        around the separators and make this unreadable. */}
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
          Editing is offered, not imposed. Most estimates are accepted as they
          are, so the numbers stay read-only until someone says otherwise.
        */}
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          className="pt-3 text-xs text-ink-muted underline"
        >
          {editing
            ? t('estimate.doneAdjusting')
            : corrected
              ? t('estimate.adjustAgain')
              : t('estimate.adjust')}
        </button>

        {editing && (
          <p className="pt-2 text-xs text-ink-muted">{t('estimate.adjustHint')}</p>
        )}

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
            {saving ? t('estimate.saving') : t('estimate.save')}
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
