import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  dayProgress,
  fitOf,
  leftOf,
  LIGHT_SNACK_MAX_KCAL,
  suggestPlan,
  type WeekSoFar,
  type MealToCome,
  type SuggestionRequest,
  type AIInferenceId,
  type DailyTargets,
  type Macros,
  type Meal,
  type MealSuggestion,
  type MealSuggestions,
} from '@/domain'
import { getEstimator, getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import { readMealsToCome, readSuggestionRequest, readWeekSoFar, slotFor } from '@/data/suggestions'
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
 * Inside Today's targets card, today only. One tap asks the model for up to
 * three things that fit what is left, built mostly from the person's own
 * foods; each one logs in a tap (with Undo), or opens the camera for when it
 * is made.
 *
 * When today's calories are used but protein is short, the week decides: room
 * in it offers a lean protein snack; none says it is better to stop for today,
 * without asking the model at all.
 */

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; answer: MealSuggestions; answerId: AIInferenceId }
  | { kind: 'failed'; reason: 'FREE' | 'PLAN' | 'ACCOUNT' | 'SESSION' | 'OTHER'; resetsAt?: string }
  | { kind: 'logged'; suggestion: MealSuggestion; meal?: Meal; undone?: boolean }

export function SuggestMeals({
  targets,
  eaten,
  training,
}: {
  targets: DailyTargets
  eaten: Macros
  /** Today's training, which shapes what is suggested: protein first after a workout. */
  training?: SuggestionRequest['trainingToday']
}) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { session, revision } = useDataRevision()
  const { logSuggestion, deleteMeal } = useActions()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [offered, setOffered] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  /** The week so far and the usual meals still to come; undefined while they are read. */
  const [context, setContext] = useState<{ week?: WeekSoFar; toCome: MealToCome[] }>()
  const week = context?.week
  const toCome = context?.toCome ?? []
  /** What the last request asked for, so Ask again asks the same. */
  const [asked, setAsked] = useState<{ kind: 'FILL' | 'PROTEIN'; maxKcal: number }>()
  const fmt = (n: number) => Math.round(n).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')

  useEffect(() => {
    let cancelled = false
    void Promise.all([readWeekSoFar(currentUserId(), targets, eaten), readMealsToCome(currentUserId())])
      .then(([readWeek, readToCome]) => !cancelled && setContext({ week: readWeek, toCome: readToCome }))
      // Unreadable, the card still offers to fill a day with room: no week, nothing to come.
      .catch(() => !cancelled && setContext({ toCome: [] }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, targets.energyKcal, eaten.energyKcal])

  const progress = dayProgress(targets, eaten)
  const plan = suggestPlan(progress, week, toCome)
  // Once asked or logged, the card stays, even though the day may now be full.
  // While the week and the meals to come are read, it waits rather than
  // offering a size it would then change, or saying "stop" too soon.
  const showing = state.kind !== 'idle' || (plan && context)
  if (!showing) return null
  const left = leftOf(progress)
  const over = Math.max(0, Math.round(-progress.energy.remaining))

  const leftWords = [
    left.energyKcal > 0 ? t('suggest.leftKcal', { kcal: fmt(left.energyKcal) }) : undefined,
    left.proteinG > 0 ? t('suggest.leftProtein', { protein: fmt(left.proteinG) }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  async function ask(again = false, want = asked) {
    const wanted = want ?? (plan && (plan.kind === 'FILL' || plan.kind === 'PROTEIN') ? plan : undefined)
    if (!wanted) return
    setAsked(wanted)
    setState({ kind: 'running' })
    try {
      const request = await readSuggestionRequest(currentUserId(), targets, eaten, {
        note,
        avoid: again ? offered : undefined,
        plan: wanted,
        week,
        toCome,
        training,
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
    const meal = await logSuggestion(suggestion, answerId, answer.model, slotFor(new Date(), toCome))
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

  /** One row of the week: "450 under", "62 g behind", "40 g over", "on target". */
  const weekCell = (balance: number, near: number, under: StringKey, over: StringKey) =>
    Math.abs(balance) < near
      ? t('suggest.weekOnTarget')
      : balance < 0
        ? t(under, { n: fmt(-balance) })
        : t(over, { n: fmt(balance) })
  const fatHigh = !!week && week.fatG >= Math.max(10, targets.fatG * 0.15)
  const slotsWords = (slots: readonly string[]) =>
    slots.map((slot) => t(`common.slotLabel.${slot}` as StringKey)).join(t('suggest.and'))
  const strength = training?.workouts.some((w) => w.kind === 'STRENGTH')
  const trainedMinutes = training?.workouts.reduce((sum, w) => sum + w.minutes, 0) ?? 0

  const date = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long' }) : ''

  return (
    <div className="mt-5 border-t border-hairline pt-4" data-testid="suggest-meals">
      {state.kind === 'idle' && plan && (
        <>
          <p className="text-sm font-semibold" data-testid="suggest-line">
            {over > 0 ? (
              <>
                {t('suggest.overLine', { kcal: fmt(over) })} · {t('suggest.shortLine', { protein: fmt(left.proteinG) })}
              </>
            ) : (
              <>
                {t('suggest.left')} <span className="font-normal text-ink-soft">{leftWords}</span>
              </>
            )}
          </p>
          {week && week.days > 1 && (
            <div className="mt-2.5 rounded-xl bg-card-soft px-3.5 py-2.5" data-testid="suggest-week">
              <p className="pb-1 text-xs font-semibold text-ink-muted">{t('suggest.weekTitle')}</p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[13px]">
                <dt className="text-ink-soft">{t('estimate.calories')}</dt>
                <dd className="tabular text-end font-semibold">
                  {weekCell(week.balanceKcal, 50, 'suggest.weekKcalUnder', 'suggest.weekKcalOver')}
                </dd>
                <dt className="text-ink-soft">{t('estimate.protein')}</dt>
                <dd className="tabular text-end font-semibold">
                  {weekCell(week.proteinG, 5, 'suggest.weekProteinBehind', 'suggest.weekProteinAhead')}
                </dd>
                <dt className="text-ink-soft">{t('estimate.fat')}</dt>
                <dd className="tabular text-end font-semibold">{weekCell(week.fatG, 5, 'suggest.weekGUnder', 'suggest.weekGOver')}</dd>
                <dt className="text-ink-soft">{t('estimate.carbs')}</dt>
                <dd className="tabular text-end font-semibold">{weekCell(week.carbsG, 10, 'suggest.weekGUnder', 'suggest.weekGOver')}</dd>
              </dl>
              <p className="pt-1 text-[11.5px] text-ink-muted">
                {t('suggest.weekSpan')}
                {week.measuredDays > 0 && ` ${t('suggest.weekMeasured')}`}
              </p>
            </div>
          )}
          {plan.kind === 'PROTEIN' && (
            <p className="pt-2 text-[13px] text-ink-soft" data-testid="suggest-hint">
              {fatHigh ? t('suggest.hintLeanProtein') : t('suggest.weekRoomProtein')}
            </p>
          )}
          {plan.kind === 'FILL' && toCome.length > 0 && (
            <p className="pt-2 text-[13px] text-ink-soft" data-testid="suggest-to-come">
              {t(toCome.length === 1 ? 'suggest.toComeOne' : 'suggest.toComeMany', {
                meals: slotsWords(toCome.map((meal) => meal.slot)),
                kcal: fmt(toCome.reduce((sum, meal) => sum + meal.usualKcal, 0)),
                max: fmt(plan.maxKcal),
              })}
            </p>
          )}
          {trainedMinutes > 0 && (plan.kind === 'FILL' || plan.kind === 'PROTEIN') && (
            <p className="pt-1.5 text-[13px] text-ink-soft" data-testid="suggest-training">
              {t(strength ? 'suggest.trainedStrength' : 'suggest.trained', { minutes: fmt(trainedMinutes) })}
            </p>
          )}
          {plan.kind === 'STOP' || plan.kind === 'WAIT' ? (
            <>
              <div className="mt-3 rounded-2xl bg-leaf-soft px-4 py-3 text-sm leading-relaxed" data-testid="suggest-stop">
                {plan.kind === 'WAIT' ? (
                  <>
                    <p className="font-semibold">{t('suggest.waitTitle', { meals: slotsWords(plan.meals) })}</p>
                    <p>{t('suggest.waitBody', { kcal: fmt(plan.kcal) })}</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{t('suggest.stopTitle')}</p>
                    <p>
                      {over > 0 ? t('suggest.stopOver', { kcal: fmt(over) }) : t('suggest.stopFull')}{' '}
                      {plan.reason === 'PROTEIN_AHEAD' && week
                        ? t('suggest.stopProteinAhead', { ahead: fmt(week.proteinG + left.proteinG), protein: fmt(left.proteinG) })
                        : `${t('suggest.stopWeek')} ${t('suggest.stopProtein', { protein: fmt(left.proteinG) })}`}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => void ask(false, { kind: 'PROTEIN', maxKcal: LIGHT_SNACK_MAX_KCAL })}
                className="mt-2.5 text-sm text-ink-soft underline underline-offset-2"
              >
                {t('suggest.hungry')}
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
                <button
                  type="button"
                  onClick={() => void ask(false, plan)}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-canvas"
                >
                  <SparkIcon />
                  {plan.kind === 'PROTEIN' ? t('suggest.askProtein') : t('suggest.ask')}
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
            {asked?.kind === 'PROTEIN'
              ? t('suggest.forProtein', { kcal: fmt(asked.maxKcal) })
              : t('suggest.for', { left: leftWords })}
          </h3>
          {state.answer.note && <p className="pt-2 text-sm text-ink-soft">{state.answer.note}</p>}
          <ul className="grid gap-2.5 pt-3">
            {state.answer.suggestions.map((suggestion, index) => {
              const fit = fitOf(suggestion, progress, asked?.kind === 'PROTEIN' ? week : undefined)
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
                    className={`pt-1 text-[12.5px] font-semibold ${fit.spareKcal >= 0 || (fit.weekAfter ?? 1) <= 0 ? 'text-ink' : 'text-ink-soft'}`}
                    data-testid="suggestion-fit"
                  >
                    {fit.todayFull
                      ? t('suggest.fitAdds', { kcal: fmt(suggestion.totals.energyKcal) })
                      : fit.spareKcal >= 0
                        ? t('suggest.fitSpare', { kcal: fmt(fit.spareKcal) })
                        : t('suggest.fitOver', { kcal: fmt(-fit.spareKcal) })}
                    {' · '}
                    {t('suggest.fitProtein', { after: fmt(fit.proteinAfter), target: fmt(fit.proteinTarget) })}
                    {fit.proteinReached && ' ✓'}
                    {fit.weekAfter !== undefined &&
                      ` · ${
                        fit.weekAfter <= 0
                          ? t('suggest.fitWeekUnder', { kcal: fmt(-fit.weekAfter) })
                          : t('suggest.fitWeekOver', { kcal: fmt(fit.weekAfter) })
                      }`}
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
                  slot: t(`common.slotLabel.${state.meal?.slot ?? slotFor(new Date(), toCome)}` as StringKey),
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
