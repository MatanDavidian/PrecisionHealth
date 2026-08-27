import { useState } from 'react'
import { scaleTo } from '@/domain'
import type { EstimateResult } from '@/ai/estimator'
import { correctionsFrom, correctsAnything, type EstimateCorrection } from '@/data/estimatedMeal'
import { useT } from '../../i18n'

/** How much one tap of the stepper moves a portion. */
const STEP_G = 10
/** Nobody plates nine hundred grams of one thing, and a runaway tap should stop. */
const MAX_G = 900

const round = (n: number) => Math.round(n * 10) / 10
const signed = (n: number) => (n > 0 ? '+' : '−')

/**
 * Correcting the portions before an estimate becomes a meal.
 *
 * Weights only, by stepper. The model is usually right about *what* is on the
 * plate and wrong about *how much*, so the one number worth arguing with gets
 * a thumb-sized control, and the macros follow it by ratio rather than being
 * six more fields to fill in. Typing straight into the box still works, since
 * eight taps to reach 250 g would be its own kind of insult.
 *
 * Editing a specific macro is still possible, after saving, in Nutrition —
 * where a person is correcting a number rather than a portion.
 */
export function AdjustPanel({
  result,
  photoUrl,
  rows,
  onChange,
  onSave,
  onBack,
  onAsk,
  saving,
}: {
  result: EstimateResult
  photoUrl?: string
  rows: EstimateCorrection[]
  onChange: (rows: EstimateCorrection[]) => void
  onSave: () => void
  onBack: () => void
  /** Absent once the follow-up allowance is spent. */
  onAsk?: () => void
  saving?: boolean
}) {
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const live = rows.filter((row) => !row.removed)
  const total = live.reduce(
    (sum, r) => ({
      kcal: sum.kcal + r.energyKcal,
      protein: sum.protein + r.proteinG,
      carbs: sum.carbs + r.carbsG,
      fat: sum.fat + r.fatG,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const estimated = result.items.reduce((sum, i) => sum + i.energyKcal, 0)
  const kcalDiff = Math.round(total.kcal - estimated)

  const setGrams = (index: number, grams: number) =>
    onChange(
      rows.map((row) =>
        row.index === index ? scaleTo(row, Math.max(0, Math.min(MAX_G, round(grams)))) : row,
      ),
    )

  const toggleRemoved = (index: number) =>
    onChange(rows.map((row) => (row.index === index ? { ...row, removed: !row.removed } : row)))

  /**
   * A food the model never saw — the oil in the pan, the second slice.
   *
   * Added at zero grams with no nutrients, because inventing numbers for it
   * would be exactly the guessing this screen exists to correct. It sits at
   * the bottom of the list waiting for a weight, and the answer to "how many
   * calories is that?" is better asked of the model than of this form.
   */
  const addFood = () => {
    const name = newName.trim()
    if (!name) return
    onChange([
      ...rows,
      {
        index: Math.max(-1, ...rows.map((r) => r.index)) + 1,
        name,
        amountG: 0,
        energyKcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      },
    ])
    setNewName('')
    setAdding(false)
  }

  return (
    <div>
      <div className="flex items-center gap-3.5">
        {photoUrl && (
          <img
            src={photoUrl}
            alt=""
            className="size-26 shrink-0 rounded-2xl object-cover"
            style={{ width: 104, height: 104 }}
          />
        )}
        <div className="min-w-0">
          <p className="text-[0.94rem] font-medium">{t('adjust.readFromPhoto')}</p>
          <p className="pt-1 text-[0.81rem] leading-relaxed text-ink-muted">{t('adjust.lead')}</p>
        </div>
      </div>

      <section className="mt-4 rounded-card bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {t('adjust.yourNumbers')}
          </p>
          <span
            className={`tabular ltr-nums rounded-full px-3 py-1 text-xs font-medium ${
              kcalDiff === 0 ? 'bg-card-soft text-ink-muted' : 'bg-accent-soft text-accent'
            }`}
          >
            {kcalDiff === 0
              ? t('adjust.unchanged')
              : t('adjust.deltaKcal', { sign: signed(kcalDiff), count: Math.abs(kcalDiff) })}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Figure name={t('estimate.calories')} value={Math.round(total.kcal).toLocaleString()} />
          <Figure name={t('estimate.protein')} value={`${Math.round(total.protein)} g`} />
          <Figure name={t('estimate.carbs')} value={`${Math.round(total.carbs)} g`} />
          <Figure name={t('estimate.fat')} value={`${Math.round(total.fat)} g`} />
        </div>

        <div className="pt-3.5">
          {rows.map((row) => {
            const original = result.items[row.index]
            const gone = Boolean(row.removed)
            const diff = original ? Math.round(row.amountG - original.amountG) : Math.round(row.amountG)
            return (
              <div
                key={row.index}
                className={`border-t border-hairline py-3.5 ${gone ? 'opacity-45' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.94rem]" dir="auto">
                      {row.name}
                    </p>
                    <p className="tabular ltr-nums pt-1 text-[0.78rem] text-ink-muted">
                      {Math.round(row.proteinG)}P · {Math.round(row.carbsG)}C ·{' '}
                      {Math.round(row.fatG)}F · {Math.round(row.energyKcal)} kcal
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface p-1">
                    <Step
                      label={t('adjust.less', { food: row.name })}
                      disabled={gone || row.amountG <= 0}
                      onClick={() => setGrams(row.index, row.amountG - STEP_G)}
                      path="M5 12h14"
                    />
                    <input
                      type="number"
                      min={0}
                      max={MAX_G}
                      disabled={gone}
                      aria-label={t('adjust.grams', { food: row.name })}
                      value={Math.round(row.amountG)}
                      onChange={(e) => setGrams(row.index, Number(e.target.value) || 0)}
                      className="tabular ltr-nums w-[66px] bg-transparent text-center text-[0.94rem] font-medium outline-none"
                    />
                    <Step
                      label={t('adjust.more', { food: row.name })}
                      disabled={gone || row.amountG >= MAX_G}
                      onClick={() => setGrams(row.index, row.amountG + STEP_G)}
                      path="M12 5v14M5 12h14"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2.5">
                  <span
                    className={`tabular ltr-nums rounded-full px-2.5 py-0.5 text-[0.72rem] ${
                      diff === 0
                        ? 'bg-card-soft text-ink-muted'
                        : 'bg-accent-soft font-medium text-accent'
                    }`}
                  >
                    {diff === 0
                      ? t('adjust.asEstimated')
                      : t('adjust.deltaGrams', { sign: signed(diff), count: Math.abs(diff) })}
                  </span>
                  {original && (
                    <span className="text-[0.72rem] text-ink-muted">
                      {t('adjust.sureOfThis', { count: Math.round(original.confidence * 100) })}
                    </span>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => toggleRemoved(row.index)}
                    className="text-xs text-ink-muted underline"
                  >
                    {gone ? t('adjust.putBack') : t('adjust.notOnPlate')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {adding ? (
          <form
            className="mt-3.5 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addFood()
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('adjust.newFoodName')}
              aria-label={t('adjust.newFoodName')}
              className="min-w-0 flex-1 rounded-full border border-hairline bg-surface px-4 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
            >
              {t('adjust.somethingMissed')}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3.5 flex w-fit items-center gap-2 rounded-full border border-dashed border-hairline px-4 py-2 text-[0.84rem] text-ink-muted transition-colors hover:bg-card-soft"
          >
            <PlusIcon />
            {t('adjust.somethingMissed')}
          </button>
        )}

        <p className="pt-3.5 text-xs leading-relaxed text-ink-muted">{t('adjust.ratios')}</p>

        <div className="flex flex-wrap gap-3 pt-4">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || live.length === 0}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            {saving ? t('estimate.saving') : t('estimate.save')}
          </button>
          <button
            type="button"
            onClick={onBack}
            disabled={!correctsAnything(result, rows) && rows.length === result.items.length}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft disabled:opacity-40"
          >
            {t('adjust.backToEstimate')}
          </button>
          {onAsk && (
            <button
              type="button"
              onClick={onAsk}
              className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
            >
              {t('adjust.letItAsk')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

/** The editable rows an adjust session starts from. */
export const startingRows = correctionsFrom

function Figure({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {name}
      </p>
      <p className="tabular ltr-nums pt-0.5 text-[1.35rem] font-medium">{value}</p>
    </div>
  )
}

function Step({
  label,
  onClick,
  disabled,
  path,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  path: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-card-soft disabled:opacity-30"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        aria-hidden
      >
        <path d={path} />
      </svg>
    </button>
  )
}

function PlusIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
