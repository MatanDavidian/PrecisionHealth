import type { WeekInsight } from '@/ai/estimator'
import { useT } from '../i18n'

export type InsightsState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; insight: WeekInsight; at: number }
  | { kind: 'failed'; message: string }

/**
 * Asking the model to read the week, and what it said back.
 *
 * The promise on this card — "nothing is sent until you ask" — is the reason it
 * exists as a button rather than something that runs on arrival. So the card
 * also says WHAT will be sent, in counted terms, before it is sent: a person
 * agreeing to share a week of their eating should be able to see the size of
 * what they are agreeing to.
 *
 * The answer is rendered from a typed shape, not from markdown. That is what
 * lets it be translated, lets "it found nothing" be a real state instead of an
 * apologetic paragraph, and keeps the model from styling the app.
 */
export function InsightsCard({
  state,
  mealCount,
  onAsk,
  onDismiss,
}: {
  state: InsightsState
  /** How many meals are in the payload, so the ask is specific. */
  mealCount: number
  onAsk: () => void
  onDismiss: () => void
}) {
  const t = useT()

  return (
    <section className="rounded-card bg-leaf-soft p-6">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf">AI</p>
      <h2 className="pt-2 font-display text-xl font-medium">{t('week.insightsTitle')}</h2>

      {state.kind === 'idle' && (
        <>
          <p className="max-w-[56ch] pt-1 text-sm text-ink-muted">{t('week.insightsBody')}</p>
          <p className="max-w-[56ch] pt-2 text-xs leading-relaxed text-ink-muted">
            {t('insights.willSend', { meals: mealCount })}
          </p>
          <button
            type="button"
            onClick={onAsk}
            className="mt-3.5 rounded-full border border-leaf/40 px-4 py-1.5 text-[0.84rem] font-medium text-leaf transition-colors hover:bg-leaf/10"
          >
            {t('week.askForInsights')}
          </button>
        </>
      )}

      {state.kind === 'running' && (
        <div className="flex items-center gap-3 pt-3">
          <span className="size-2.5 animate-pulse rounded-full bg-leaf" />
          <div>
            <p className="text-sm font-medium">{t('insights.reading')}</p>
            <p className="pt-0.5 text-xs text-ink-muted">{t('insights.takesAMoment')}</p>
          </div>
        </div>
      )}

      {state.kind === 'failed' && (
        <>
          <p className="pt-2 text-sm text-accent">{t('insights.failed')}</p>
          <p className="max-w-[56ch] pt-1 text-xs text-ink-muted" dir="auto">
            {state.message}
          </p>
          <button
            type="button"
            onClick={onAsk}
            className="mt-3.5 rounded-full border border-leaf/40 px-4 py-1.5 text-[0.84rem] font-medium text-leaf transition-colors hover:bg-leaf/10"
          >
            {t('insights.tryAgain')}
          </button>
        </>
      )}

      {state.kind === 'done' && (
        <div className="pt-3">
          <p className="max-w-[56ch] text-[0.98rem] leading-relaxed" dir="auto">
            {state.insight.summary}
          </p>

          {state.insight.observations.length > 0 && (
            <>
              <p className="pb-1.5 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf">
                {t('insights.observations')}
              </p>
              <ul className="list-disc space-y-1 ps-4 text-sm leading-relaxed text-ink-muted">
                {state.insight.observations.map((line) => (
                  <li key={line} dir="auto">
                    {line}
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="pb-1.5 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf">
            {t('insights.suggestions')}
          </p>
          {/* An empty list is a real answer, and worth saying plainly rather
              than hiding the heading and leaving a gap. */}
          {state.insight.suggestions.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('insights.nothingToSuggest')}</p>
          ) : (
            <ul className="list-disc space-y-1 ps-4 text-sm leading-relaxed">
              {state.insight.suggestions.map((line) => (
                <li key={line} dir="auto">
                  {line}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-4">
            <span className="tabular ltr-nums rounded-full bg-surface/70 px-2.5 py-0.5 text-[0.72rem] text-ink-muted">
              {t('insights.confidence', { count: Math.round(state.insight.confidence * 100) })}
            </span>
            {state.insight.confidence < 0.5 && (
              <span className="text-xs text-ink-muted">{t('insights.lowConfidence')}</span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={onAsk}
              className="rounded-full border border-leaf/40 px-3.5 py-1 text-xs font-medium text-leaf transition-colors hover:bg-leaf/10"
            >
              {t('insights.askAgain')}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full px-2.5 py-1 text-xs text-ink-muted"
            >
              {t('insights.dismiss')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
