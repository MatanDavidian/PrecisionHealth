import { useState } from 'react'
import type { EstimateResult } from '@/ai/estimator'
import { useT } from '../../i18n'

/**
 * The model asking for the one thing it could not see.
 *
 * Shaped as a message rather than a form, because that is what it is: the
 * estimate is already complete and saveable, and this is the model saying
 * which of its own numbers it distrusts. Hence the reason line — a question
 * without one is an interrogation, asking the user to work for the model with
 * no idea what it buys them.
 *
 * The chips are shortcuts, never the whole answer space. Typing something the
 * model did not anticipate is the case that matters most, so the free-text box
 * sits directly beneath them rather than behind a "something else" tap.
 */
export function QuestionCard({
  result,
  photoUrl,
  onAnswer,
  onSkip,
}: {
  result: EstimateResult
  photoUrl?: string
  onAnswer: (answer: string) => void
  onSkip: () => void
}) {
  const t = useT()
  const [typed, setTyped] = useState('')
  if (!result.question) return null

  const total = result.items.reduce(
    (sum, i) => ({
      kcal: sum.kcal + i.energyKcal,
      protein: sum.protein + i.proteinG,
      carbs: sum.carbs + i.carbsG,
      fat: sum.fat + i.fatG,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

  return (
    <div>
      <div className="flex items-center gap-3.5">
        {photoUrl && (
          <img
            src={photoUrl}
            alt=""
            className="shrink-0 rounded-2xl object-cover"
            style={{ width: 104, height: 104 }}
          />
        )}
        <div className="min-w-0">
          {/*
            Two runs, not one string, and only one of them is pinned.

            "711 kcal" carries a real word as its unit, so it must flow in the
            page's direction — pinned LTR in Hebrew it reads "calories 711",
            which is backwards. The macro run is punctuation around digits with
            no word in it, so bidi would scramble it and it has to stay LTR.
            The separator sits between the two, outside both.
          */}
          <p className="text-[0.94rem] font-medium">
            <span className="tabular">
              {t('ask.summaryKcal', { kcal: Math.round(total.kcal).toLocaleString() })}
            </span>
            {' · '}
            <span className="tabular ltr-nums text-ink-muted">
              {Math.round(total.protein)}P · {Math.round(total.carbs)}C · {Math.round(total.fat)}F
            </span>
          </p>
          <p className="pt-1 text-[0.81rem] leading-relaxed text-ink-muted">{t('ask.usable')}</p>
        </div>
      </div>

      <section className="mt-4 rounded-card border border-hairline bg-surface p-5">
        <div className="flex items-center gap-2.5">
          <span className="size-6 shrink-0 rounded-full bg-accent" />
          <span className="text-[0.78rem] font-medium">{t('ask.appName')}</span>
          <span className="text-[0.72rem] text-ink-muted">{t('ask.justNow')}</span>
        </div>

        <p className="pt-3 font-display text-xl leading-snug font-medium" dir="auto">
          {result.question}
        </p>
        {result.questionReason && (
          <p className="max-w-[52ch] pt-2 text-[0.84rem] leading-relaxed text-ink-muted" dir="auto">
            {result.questionReason}
          </p>
        )}

        {result.questionOptions && result.questionOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-4">
            {result.questionOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onAnswer(option)}
                dir="auto"
                className="rounded-full border border-hairline bg-surface px-4 py-2 text-[0.84rem] transition-colors hover:bg-card-soft"
              >
                {option}
              </button>
            ))}
          </div>
        )}

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
            placeholder={t('ask.ownWords')}
            aria-label={t('estimate.question.label')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            disabled={!typed.trim()}
            aria-label={t('ask.send')}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-surface disabled:opacity-40"
          >
            {/* Points the way the text runs, so it means "send" in both. */}
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

        <div className="flex flex-wrap items-center gap-4 pt-4">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {t('ask.skip')}
          </button>
          <span className="text-xs text-ink-muted">{t('ask.neverBlocks')}</span>
        </div>
      </section>
    </div>
  )
}
