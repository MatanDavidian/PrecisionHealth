import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  dayProgress,
  fitOf,
  hasRoom,
  leftOf,
  type AIInferenceId,
  type DailyTargets,
  type Macros,
  type Meal,
  type MealSuggestion,
  type MealSuggestions,
} from '@/domain'
import { getEstimator, getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import { suggestSlot } from '@/data/newRecords'
import { readSuggestionRequest } from '@/data/suggestions'
import { buildSuggestionInference } from '@/data/estimatedMeal'
import { EstimateError } from '@/ai/estimator'
import { PlanExhaustedError, TrialExhaustedError } from '@/ai/proxyEstimator'
import { useActions } from '../useHealthData'
import { useDataRevision } from '../DataProvider'
import { useLang } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { ReportAnswer } from './ReportAnswer'

/**
 * What to eat now (docs/features/meal-suggestions.md).
 *
 * Inside Today's targets card, today only, while the day has room. One tap
 * asks the model for up to three things that fit what is left, built mostly
 * from the person's own foods; each one logs in a tap (with Undo), or opens
 * the camera for when it is made.
 */

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; answer: MealSuggestions; answerId: AIInferenceId }
  | { kind: 'failed'; reason: 'FREE' | 'PLAN' | 'ACCOUNT' | 'SESSION' | 'OTHER'; resetsAt?: string }
  | { kind: 'logged'; suggestion: MealSuggestion; meal?: Meal; undone?: boolean }

export function SuggestMeals({ targets, eaten }: { targets: DailyTargets; eaten: Macros }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { session } = useDataRevision()
  const { logSuggestion, deleteMeal } = useActions()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [offered, setOffered] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const fmt = (n: number) => Math.round(n).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')

  const progress = dayProgress(targets, eaten)
  // Once something is logged, the card says so even though the day may now be full.
  if (!hasRoom(progress) && state.kind !== 'logged') return null
  const left = leftOf(progress)

  const leftWords = [
    left.energyKcal > 0 ? t('suggest.leftKcal', { kcal: fmt(left.energyKcal) }) : undefined,
    left.proteinG > 0 ? t('suggest.leftProtein', { protein: fmt(left.proteinG) }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  async function ask(again = false) {
    setState({ kind: 'running' })
    try {
      const request = await readSuggestionRequest(currentUserId(), targets, eaten, {
        note,
        avoid: again ? offered : undefined,
      })
      const answer = await getEstimator().suggestMeals(request, { language: lang })
      const inference = buildSuggestionInference(currentUserId(), request, answer)
      // The audit row (D13), as the week's insights keep theirs.
      await getRepositories().inferences.add(inference).catch(() => undefined)
      setOffered(answer.suggestions.map((s) => s.title))
      setState({ kind: 'done', answer, answerId: inference.id })
    } catch (cause) {
      if (cause instanceof TrialExhaustedError) return setState({ kind: 'failed', reason: 'FREE' })
      if (cause instanceof PlanExhaustedError) return setState({ kind: 'failed', reason: 'PLAN', resetsAt: cause.resetsAt })
      if (cause instanceof EstimateError && cause.kind === 'SESSION') return setState({ kind: 'failed', reason: 'SESSION' })
      if (cause instanceof EstimateError && cause.kind === 'NO_KEY') {
        return setState({ kind: 'failed', reason: session.authenticated ? 'OTHER' : 'ACCOUNT' })
      }
      setState({ kind: 'failed', reason: 'OTHER' })
    }
  }

  async function log(suggestion: MealSuggestion, answer: MealSuggestions, answerId: AIInferenceId) {
    setBusy(true)
    const meal = await logSuggestion(suggestion, answerId, answer.model, suggestSlot(new Date()))
    setBusy(false)
    if (meal) setState({ kind: 'logged', suggestion, meal })
  }

  function photograph(suggestion: MealSuggestion) {
    const words = t('suggest.photoNote', {
      title: suggestion.title,
      foods: suggestion.foods.map((food) => food.name).join(', '),
    })
    navigate(`/log?mode=photo&note=${encodeURIComponent(words)}`)
  }

  const date = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long' }) : ''

  return (
    <div className="mt-5 border-t border-hairline pt-4" data-testid="suggest-meals">
      {state.kind === 'idle' && (
        <>
          <p className="text-sm font-semibold">
            {t('suggest.left')} <span className="font-normal text-ink-soft">{leftWords}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
            <button
              type="button"
              onClick={() => void ask()}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-canvas"
            >
              <SparkIcon />
              {t('suggest.ask')}
            </button>
            {!noteOpen && (
              <button type="button" onClick={() => setNoteOpen(true)} className="text-sm text-ink-soft underline underline-offset-2">
                {t('suggest.addNote')}
              </button>
            )}
          </div>
          {noteOpen && (
            <div className="pt-3">
              <label htmlFor="suggest-note" className="sr-only">
                {t('suggest.noteLabel')}
              </label>
              <input
                id="suggest-note"
                autoFocus
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('suggest.notePlaceholder')}
                className="w-full rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
          )}
          <p className="pt-2.5 text-xs leading-relaxed text-ink-muted">{t('suggest.costs')}</p>
        </>
      )}

      {state.kind === 'running' && (
        <div role="status" aria-live="polite">
          <div className="flex items-center gap-3.5">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            <div>
              <p className="text-sm font-medium">{t('suggest.thinking')}</p>
              <p className="text-xs text-ink-muted">{t('suggest.usually')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setState({ kind: 'idle' })}
            className="mt-3 rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm"
          >
            {t('suggest.cancel')}
          </button>
        </div>
      )}

      {state.kind === 'done' && (
        <section aria-labelledby="suggest-title">
          <h3 id="suggest-title" className="text-sm font-semibold">
            {t('suggest.for', { left: leftWords })}
          </h3>
          {state.answer.note && <p className="pt-2 text-sm text-ink-soft">{state.answer.note}</p>}
          <ul className="grid gap-2.5 pt-3">
            {state.answer.suggestions.map((suggestion, index) => {
              const fit = fitOf(suggestion, progress)
              return (
                <li
                  key={`${suggestion.title}-${index}`}
                  className={`rounded-2xl border bg-surface p-3.5 ${index === 0 ? 'border-accent' : 'border-hairline'}`}
                  data-testid="suggestion"
                >
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      suggestion.source === 'USUAL'
                        ? 'bg-leaf-soft text-ink'
                        : suggestion.source === 'NEW'
                          ? 'bg-accent-soft text-ink'
                          : 'bg-card-soft text-ink-soft'
                    }`}
                  >
                    {t(`suggest.source.${suggestion.source}` as StringKey)}
                  </span>
                  <p className="pt-2 text-[15px] font-semibold leading-snug">{suggestion.title}</p>
                  <ul className="pt-1 text-[13px] leading-relaxed text-ink-soft">
                    {suggestion.foods.map((food, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span>{food.name}</span>
                        <span className="tabular ltr-nums shrink-0">{t('suggest.grams', { grams: fmt(food.amountG) })}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="tabular pt-2 text-[12.5px] text-ink-soft">
                    {t('suggest.macros', {
                      kcal: fmt(suggestion.totals.energyKcal),
                      protein: fmt(suggestion.totals.proteinG),
                      carbs: fmt(suggestion.totals.carbsG),
                      fat: fmt(suggestion.totals.fatG),
                    })}
                  </p>
                  <p
                    className={`pt-1 text-[12.5px] font-semibold ${fit.spareKcal >= 0 ? 'text-leaf' : 'text-ink-soft'}`}
                    data-testid="suggestion-fit"
                  >
                    {fit.spareKcal >= 0
                      ? t('suggest.fitSpare', { kcal: fmt(fit.spareKcal) })
                      : t('suggest.fitOver', { kcal: fmt(-fit.spareKcal) })}
                    {' · '}
                    {t('suggest.fitProtein', { after: fmt(fit.proteinAfter), target: fmt(fit.proteinTarget) })}
                    {fit.proteinReached && ' ✓'}
                  </p>
                  {suggestion.why && <p className="pt-1 text-[12.5px] leading-relaxed text-ink-muted">{suggestion.why}</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void log(suggestion, state.answer, state.answerId)}
                      aria-label={t('suggest.logItNamed', { title: suggestion.title })}
                      className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-canvas disabled:opacity-50"
                    >
                      {t('suggest.logIt')}
                    </button>
                    <button
                      type="button"
                      onClick={() => photograph(suggestion)}
                      aria-label={t('suggest.photoNamed', { title: suggestion.title })}
                      className="rounded-full border border-hairline px-4 py-1.5 text-sm"
                    >
                      {t('suggest.photo')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="pt-2.5 text-xs leading-relaxed text-ink-muted">{t('suggest.photoHint')}</p>
          <div className="flex flex-wrap gap-2 pt-3">
            <button type="button" onClick={() => void ask(true)} className="rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm">
              {t('suggest.again')}
            </button>
            <button type="button" onClick={() => setState({ kind: 'idle' })} className="rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm">
              {t('suggest.close')}
            </button>
          </div>
          <p className="pt-3 text-xs text-ink-muted">{t('suggest.notMedical')}</p>
          <ReportAnswer kind="insight" model={state.answer.model} />
        </section>
      )}

      {state.kind === 'logged' && (
        <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-leaf-soft px-4 py-3 text-sm">
          <span>
            {state.undone
              ? t('suggest.undone')
              : t('suggest.logged', {
                  slot: t(`common.slotLabel.${state.meal?.slot ?? suggestSlot(new Date())}` as StringKey),
                  title: state.suggestion.title,
                  kcal: fmt(state.suggestion.totals.energyKcal),
                })}
          </span>
          {state.meal && !state.undone ? (
            <button
              type="button"
              onClick={() =>
                void deleteMeal(state.meal!).then((ok) => ok && setState({ ...state, undone: true }))
              }
              className="font-semibold underline underline-offset-2"
            >
              {t('suggest.undo')}
            </button>
          ) : (
            <button type="button" onClick={() => setState({ kind: 'idle' })} className="underline underline-offset-2">
              {t('suggest.close')}
            </button>
          )}
        </div>
      )}

      {state.kind === 'failed' && (
        <div role="alert" className="rounded-2xl bg-surface px-4 py-3 text-sm leading-relaxed">
          {state.reason === 'FREE' && (
            <>
              <p>{t('suggest.outFree')}</p>
              <Link to="/settings?tab=ai" className="mt-2 inline-block font-medium underline underline-offset-2">
                {t('log.exhausted.seePlan')}
              </Link>
            </>
          )}
          {state.reason === 'PLAN' && <p>{t('suggest.outPlan', { date: date(state.resetsAt) })}</p>}
          {state.reason === 'ACCOUNT' && (
            <>
              <p>{t('suggest.needAccount')}</p>
              <Link to="/signin?next=/today" className="mt-2 inline-block font-medium underline underline-offset-2">
                {t('log.setup.signIn')}
              </Link>
            </>
          )}
          {state.reason === 'SESSION' && (
            <Link to="/signin?next=/today" className="font-medium underline underline-offset-2">
              {t('log.error.signInAgain')}
            </Link>
          )}
          {state.reason === 'OTHER' && (
            <>
              <p>{t('suggest.failed')}</p>
              <button type="button" onClick={() => void ask()} className="mt-2 font-medium underline underline-offset-2">
                {t('common.retry')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
    </svg>
  )
}
