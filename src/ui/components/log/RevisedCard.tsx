import { useState } from 'react'
import type { EstimateResult, FollowUp } from '@/ai/estimator'
import { useT } from '../../i18n'

const totalsOf = (result: EstimateResult) =>
  result.items.reduce(
    (sum, i) => ({
      kcal: sum.kcal + i.energyKcal,
      protein: sum.protein + i.proteinG,
      carbs: sum.carbs + i.carbsG,
      fat: sum.fat + i.fatG,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

/**
 * An estimate that has been through a question, and what that changed.
 *
 * The deltas are the entire justification for having asked. "Fat 16 g" is a
 * number; "Fat 16 g, +5" is the answer paying for itself, and without it a
 * user has no way to tell whether replying was worth the tap — which decides
 * whether they ever reply again.
 *
 * The transcript below is not decoration either. Once the meal is saved, the
 * numbers are all that survive in the day's totals; this is the only place the
 * reasoning behind them is visible while it still matters.
 */
export function RevisedCard({
  result,
  previous,
  answers,
  saving,
  onSave,
  onAdjust,
  onAnswer,
}: {
  result: EstimateResult
  /** The estimate as it stood before the last answer. */
  previous?: EstimateResult
  answers: readonly FollowUp[]
  saving?: boolean
  onSave: () => void
  onAdjust: () => void
  /** Absent once the follow-up allowance is spent. */
  onAnswer?: (answer: string) => void
}) {
  const t = useT()
  const [typed, setTyped] = useState('')

  const now = totalsOf(result)
  const before = previous ? totalsOf(previous) : undefined

  /** Foods in this revision that were not in the one before it. */
  const added = previous
    ? result.items.filter(
        (item) => !previous.items.some((old) => old.name.trim() === item.name.trim()),
      )
    : []

  return (
    <div className="pt-4">
      <section className="rounded-card bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {t('revised.label', { count: answers.length + 1 })}
          </p>
          <span className="rounded-full bg-leaf-soft px-3 py-1 text-xs font-medium text-leaf">
            {t('revised.updated')}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Figure
            name={t('estimate.calories')}
            value={Math.round(now.kcal).toLocaleString()}
            delta={before && Math.round(now.kcal - before.kcal)}
          />
          <Figure
            name={t('estimate.protein')}
            value={`${Math.round(now.protein)} g`}
            delta={before && Math.round(now.protein - before.protein)}
            unit="g"
          />
          <Figure
            name={t('estimate.carbs')}
            value={`${Math.round(now.carbs)} g`}
            delta={before && Math.round(now.carbs - before.carbs)}
            unit="g"
          />
          <Figure
            name={t('estimate.fat')}
            value={`${Math.round(now.fat)} g`}
            delta={before && Math.round(now.fat - before.fat)}
            unit="g"
          />
        </div>

        {previous && (
          <div className="mt-3.5 flex items-center gap-2.5 border-t border-hairline pt-3">
            <span className="text-[0.84rem] text-ink-muted">{t('revised.addedFrom')}</span>
            <span className="flex-1" />
            <span className="text-sm font-medium" dir="auto">
              {added.length > 0
                ? added.map((item) => item.name).join(', ')
                : t('revised.noExtra')}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-4">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
          >
            {saving ? t('estimate.saving') : t('estimate.save')}
          </button>
          <button
            type="button"
            onClick={onAdjust}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {t('revised.adjustByHand')}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-card border border-hairline bg-surface p-5">
        <p className="pb-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {t('revised.howItGotHere')}
        </p>

        <div className="flex flex-col gap-3.5">
          {answers.map((round, i) => (
            <div key={i} className="flex flex-col gap-3.5">
              <div className="flex gap-2.5">
                <span className="mt-0.5 size-5.5 shrink-0 rounded-full bg-accent" style={{ width: 22, height: 22 }} />
                <p className="m-0 max-w-[52ch] text-sm leading-relaxed text-ink-muted" dir="auto">
                  {round.question}
                </p>
              </div>
              <div className="flex justify-end">
                <p
                  className="max-w-[40ch] rounded-2xl rounded-ee-sm bg-card-soft px-4 py-2.5 text-sm leading-normal"
                  dir="auto"
                >
                  {round.answer}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* A further question, if the model still has one and the budget allows. */}
        {result.question && onAnswer && (
          <div className="mt-4 border-t border-hairline pt-4">
            <div className="flex gap-2.5">
              <span className="mt-0.5 shrink-0 rounded-full bg-accent" style={{ width: 22, height: 22 }} />
              <div className="min-w-0">
                <p className="m-0 max-w-[48ch] text-[0.94rem] font-medium leading-normal" dir="auto">
                  {result.question}
                </p>
                {result.questionOptions && result.questionOptions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-3">
                    {result.questionOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onAnswer(option)}
                        dir="auto"
                        className="rounded-full border border-hairline bg-canvas px-3.5 py-1.5 text-[0.84rem] transition-colors hover:bg-card-soft"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <form
              className="mt-3.5 flex items-center gap-2.5 rounded-full border border-hairline bg-canvas py-1.5 pe-1.5 ps-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!typed.trim()) return
                onAnswer(typed)
                setTyped('')
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={t('ask.answerOrCorrect')}
                aria-label={t('estimate.question.label')}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
              />
              <button
                type="submit"
                disabled={!typed.trim()}
                aria-label={t('ask.send')}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-surface disabled:opacity-40"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.75"
                  className="rtl:-scale-x-100"
                  aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          </div>
        )}

        <p className="pt-3 text-xs leading-relaxed text-ink-muted">
          {t('revised.oneConversation')}
        </p>
      </section>
    </div>
  )
}

function Figure({
  name,
  value,
  delta,
  unit,
}: {
  name: string
  value: string
  delta?: number
  unit?: string
}) {
  const t = useT()
  const moved = delta !== undefined && delta !== 0
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {name}
      </p>
      <p
        className={`tabular ltr-nums pt-0.5 text-[1.35rem] font-medium ${moved ? 'text-accent' : ''}`}
      >
        {value}
      </p>
      {delta !== undefined && (
        <p className="tabular ltr-nums pt-0.5 text-[0.72rem] text-ink-muted">
          {moved
            ? t(unit ? 'revised.deltaG' : 'revised.delta', {
                sign: delta > 0 ? '+' : '−',
                count: Math.abs(delta),
              })
            : t('revised.unchanged')}
        </p>
      )}
    </div>
  )
}
