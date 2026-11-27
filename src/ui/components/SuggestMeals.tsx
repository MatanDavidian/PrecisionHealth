import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  dayProgress,
  fitOf,
  leftOf,
  LIGHT_SNACK_MAX_KCAL,
  carbFocus,
  fatLow,
  minutesToBedtime,
  planRange,
  proteinPerSitting,
  suggestPlan,
  todayQuestion,
  type TrainingCredit,
  type AIInferenceId,
  type CalendarDate,
  type DailyTargets,
  type Macros,
  type Meal,
  type MealSuggestion,
  type MealSuggestions,
  type PlanStatus,
  type SuggestionRequest,
  type WeekSoFar,
} from '@/domain'
import { getEstimator, getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import {
  readSuggestionRequest,
  readTodayContext,
  readWeekSoFar,
  slotFor,
  type MissingMeal,
  type TodayContext,
} from '@/data/suggestions'
import { buildSuggestionInference } from '@/data/estimatedMeal'
import { readTrainingCredit, readUsualBedtime } from '@/data/precision'
import { EstimateError } from '@/ai/estimator'
import { PlanExhaustedError, TrialExhaustedError } from '@/ai/proxyEstimator'
import { useActions } from '../useHealthData'
import { useDataRevision } from '../DataProvider'
import { useLang } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { ReportAnswer } from './ReportAnswer'

/**
 * What to eat now (docs/features/meal-suggestions.md, and the precision
 * design, meal-suggestions-precision.md).
 *
 * Inside Today's targets card, today only. Vimetry decides whether to offer
 * anything, how much, and why: today's room after the usual meals still to
 * come, and, when today's calories are used, where the period stands against
 * its plan range. The model only chooses foods within the stated cap, and
 * the cap is checked again on its answer.
 *
 * Before asking, if a usual meal looks missing today (or the day looks low
 * for the hour), the card asks about it first: a forgotten lunch would make
 * every suggestion too generous.
 */

type Want = { kind: 'FILL' | 'PROTEIN'; maxKcal: number; light?: boolean }

type State =
  | { kind: 'idle'; added?: string }
  | { kind: 'question'; question: { kind: 'MISSING'; meal: MissingMeal } | { kind: 'LOW'; warned?: boolean }; want: Want }
  | { kind: 'running' }
  | { kind: 'done'; answer: MealSuggestions; answerId: AIInferenceId }
  | { kind: 'failed'; reason: 'FREE' | 'PLAN' | 'ACCOUNT' | 'SESSION' | 'OTHER'; resetsAt?: string }
  | { kind: 'logged'; suggestion: MealSuggestion; meal?: Meal; undone?: boolean }

/** Few logged days: no usual foods yet, so the suggestions are general ideas. */
const NEWCOMER_DAYS = 3

export function SuggestMeals({
  targets: dayTargets,
  eaten,
  training,
  weightKg,
}: {
  targets: DailyTargets
  eaten: Macros
  /** Today's training, which shapes what is suggested: protein first after a workout. */
  training?: SuggestionRequest['trainingToday']
  /** The person's weight: protein per sitting and the fat floor (§5.3). */
  weightKg?: number
}) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { session, revision } = useDataRevision()
  const { logSuggestion, deleteMeal, recordDayCheck, logRepeat } = useActions()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [noteOpen, setNoteOpen] = useState(false)
  /** The details behind ⓘ: closed until asked for. */
  const [infoOpen, setInfoOpen] = useState(false)
  const [note, setNote] = useState('')
  const [offered, setOffered] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  /** The period so far, today against the person's habits, today's training credit and the usual bedtime; undefined while read. */
  const [context, setContext] = useState<{
    week?: WeekSoFar
    today: TodayContext
    credit?: TrainingCredit
    bedtime?: string
  }>()
  /** What the last request asked for, so Ask again asks the same. */
  const [asked, setAsked] = useState<Want>()
  const locale = lang === 'he' ? 'he-IL' : 'en-US'
  const fmt = (n: number) => Math.round(n).toLocaleString(locale)
  /**
   * "+89", "−237". In Hebrew the number is isolated left to right (U+2066 …
   * U+2069), or the right-to-left line moves its sign to the other end: "89+".
   */
  const signed = (n: number) => {
    const text = (Math.round(n) > 0 ? '+' : Math.round(n) < 0 ? '−' : '') + fmt(Math.abs(n))
    return lang === 'he' ? `\u2066${text}\u2069` : text
  }
  const dateOf = (day: CalendarDate) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      readWeekSoFar(currentUserId(), dayTargets, eaten),
      readTodayContext(currentUserId()),
      readTrainingCredit(currentUserId(), dayTargets).catch(() => undefined),
      readUsualBedtime(currentUserId()).catch(() => undefined),
    ])
      .then(([week, today, credit, bedtime]) => !cancelled && setContext({ week, today, credit, bedtime }))
      // Unreadable, the card still offers to fill a day with room: no period, nothing to come.
      .catch(() => !cancelled && setContext({ today: { toCome: [], missing: [], answers: { skipped: [] }, loggedDays: 0 } }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, dayTargets.energyKcal, eaten.energyKcal])

  /*
    Today's training beyond the usual earns room (§5.2): today's target, and
    so today's budget in the period, go up by the credit. The targets card
    above keeps the day's target as it is; only what the suggestions offer
    changes.
  */
  const credit = context?.credit
  const targets = credit ? { ...dayTargets, energyKcal: dayTargets.energyKcal + credit.creditKcal } : dayTargets
  const week =
    context?.week && credit
      ? {
          ...context.week,
          balanceKcal: context.week.balanceKcal - credit.creditKcal,
          budgetKcal: context.week.budgetKcal + credit.creditKcal,
        }
      : context?.week
  const toCome = context?.today.toCome ?? []
  const progress = dayProgress(targets, eaten)
  const toBed = minutesToBedtime(hhmm(new Date()), context?.bedtime)
  const plan = suggestPlan(progress, week, toCome, { nearBedtime: toBed !== undefined })
  // Once asked or logged, the card stays, even though the day may now be full.
  // While the period and today's habits are read, it waits rather than
  // offering a size it would then change, or a verdict too soon.
  const showing = state.kind !== 'idle' || (plan && context)
  if (!showing) return null

  const left = leftOf(progress)
  const over = Math.max(0, Math.round(-progress.energy.remaining))
  const today = week?.today.day
  const period = week && !week.sparse ? `${dateOf(week.from)} – ${dateOf(week.to)}` : t('suggest.today')
  /** The balance the plan range decided on: the period's, or today's alone. */
  const balance =
    plan?.kind === 'USED' ? { balanceKcal: plan.balanceKcal, budgetKcal: plan.budgetKcal } : undefined
  const statusWords = (status: PlanStatus) => t(`suggest.status.${status}` as StringKey)

  const leftWords = [
    left.energyKcal > 0 ? t('suggest.leftKcal', { kcal: fmt(left.energyKcal) }) : undefined,
    left.proteinG > 0 ? t('suggest.leftProtein', { protein: fmt(left.proteinG) }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  /** Asks the model, after asking the person about today if something looks missing. */
  async function ask(want: Want, again = false, askedToday = false) {
    const ctx = context?.today
    const question =
      !again && !askedToday && ctx
        ? todayQuestion({
            missing: ctx.missing,
            eatenKcal: eaten.energyKcal,
            targetKcal: targets.energyKcal,
            nowTime: hhmm(new Date()),
            completeness: ctx.answers.completeness,
            skipped: ctx.answers.skipped,
          })
        : undefined
    if (question) {
      setState({
        kind: 'question',
        question: question.kind === 'MISSING' ? { kind: 'MISSING', meal: ctx!.missing[0] } : { kind: 'LOW' },
        want,
      })
      return
    }
    setAsked(want)
    setState({ kind: 'running' })
    try {
      const request = await readSuggestionRequest(currentUserId(), targets, eaten, {
        note,
        avoid: again ? offered : undefined,
        plan: { kind: want.kind, maxKcal: want.maxKcal },
        week,
        toCome,
        training,
        weightKg,
        minutesToBedtime: toBed,
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

  const fatHigh = !!week && !week.sparse && week.fatG >= Math.max(10, targets.fatG * 0.15)
  const slotsWords = (slots: readonly string[]) =>
    slots.map((slot) => t(`common.slotLabel.${slot}` as StringKey)).join(t('suggest.and'))
  const strength = training?.workouts.some((w) => w.kind === 'STRENGTH')
  const refuel = carbFocus(training?.workouts ?? []) === 'REFUEL'
  const sitting = weightKg ? proteinPerSitting(weightKg) : undefined
  const lowFat = fatLow(week, weightKg)
  const duration = (minutes: number) =>
    minutes >= 60
      ? minutes % 60 === 0
        ? t('suggest.hoursOnly', { h: fmt(minutes / 60) })
        : t('suggest.hoursMinutes', { h: fmt(Math.floor(minutes / 60)), m: fmt(minutes % 60) })
      : t('suggest.minutesOnly', { m: fmt(minutes) })
  const trainedMinutes = training?.workouts.reduce((sum, w) => sum + w.minutes, 0) ?? 0
  const newcomer = (context?.today.loggedDays ?? 0) < NEWCOMER_DAYS
  /** A day waiting for an answer: a dot on ⓘ, so it is not missed with the details closed. */
  const waiting = !!week?.excluded.some((day) => day.reason === 'UNANSWERED')
  const lightWant: Want = { kind: 'PROTEIN', maxKcal: LIGHT_SNACK_MAX_KCAL, light: true }

  const date = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long' }) : ''

  /** "Up to 120 kcal: Sun 22 – Thu 26 Nov would be at most +209, still within plan range." */
  const projection = (maxKcal: number) => {
    if (!balance) return undefined
    const after = balance.balanceKcal + maxKcal
    const now = planRange(balance.balanceKcal, balance.budgetKcal).status
    const then = planRange(after, balance.budgetKcal).status
    return t('suggest.projection', {
      max: fmt(maxKcal),
      period,
      after: signed(after),
      status: `${now === then ? t('suggest.still') : ''}${statusWords(then)}`,
    })
  }

  return (
    <div className="mt-4 border-t border-hairline pt-4" data-testid="suggest-meals">
      {/*
        Minimal on purpose (owner, 2026-11-27): one button and one short line.
        Everything that explains it (the period, the plan range, why, the
        days waiting for an answer, training, protein per sitting, bedtime)
        is one tap away behind ⓘ.
      */}
      {state.kind === 'idle' && plan && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {plan.kind === 'FILL' || (plan.kind === 'USED' && plan.primary) ? (
              <button
                type="button"
                onClick={() => void ask({ kind: plan.kind === 'FILL' ? 'FILL' : 'PROTEIN', maxKcal: plan.maxKcal })}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-canvas"
              >
                <SparkIcon />
                {plan.kind === 'FILL' ? t('suggest.ask') : t('suggest.askProtein')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void ask(lightWant)}
                className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2.5 text-sm"
              >
                {t('suggest.light')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setInfoOpen((open) => !open)}
              aria-expanded={infoOpen}
              aria-controls="suggest-info"
              aria-label={t('suggest.info')}
              className="relative inline-flex size-8 items-center justify-center rounded-full border border-hairline text-ink-soft"
              data-testid="suggest-info-toggle"
            >
              <InfoIcon />
              {waiting && (
                <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-accent" aria-hidden="true" data-testid="suggest-info-dot" />
              )}
            </button>
          </div>
          <p className="pt-2 text-[13px] text-ink-soft" data-testid="suggest-line">
            {plan.kind === 'WAIT'
              ? t('suggest.waitTitle', { meals: slotsWords(plan.meals) })
              : plan.kind === 'USED' && plan.status === 'ABOVE'
                ? t('suggest.stopTitle')
                : over > 0
                  ? `${t('suggest.overShort', { kcal: fmt(over) })}${left.proteinG > 0 ? ` · ${t('suggest.dayProteinShort', { protein: fmt(left.proteinG) })}` : ''}`
                  : `${t('suggest.left')} ${leftWords}`}
          </p>
          {state.added && (
            <p role="status" className="mt-2 rounded-xl bg-leaf-soft px-3 py-2 text-[13px]">
              {state.added}
            </p>
          )}
        </>
      )}

      {infoOpen && (
        <div id="suggest-info" className="mt-3 grid gap-1.5 rounded-2xl bg-card-soft px-4 py-3 text-[13px] leading-relaxed text-ink-soft" data-testid="suggest-info">
          {week && week.periodDays > 1 && periodBlock()}
          {plan?.kind === 'USED' && (
            <div data-testid="suggest-stop">
              {plan.status === 'ABOVE' ? (
                <p>
                  {plan.scope === 'WEEK'
                    ? t('suggest.aboveWeek', { period, kcal: fmt(plan.balanceKcal) })
                    : t('suggest.aboveToday', { kcal: fmt(plan.balanceKcal) })}
                </p>
              ) : plan.status === 'WITHIN' ? (
                <p data-testid="suggest-status">
                  {plan.scope === 'WEEK'
                    ? over > 0
                      ? t('suggest.withinWeek', { kcal: fmt(over), period })
                      : t('suggest.withinWeekUsed', { period })
                    : t('suggest.withinToday', { balance: signed(plan.balanceKcal), range: fmt(plan.rangeKcal) })}
                </p>
              ) : (
                <p data-testid="suggest-hint">{fatHigh ? t('suggest.hintLeanProtein') : t('suggest.weekRoomProtein')}</p>
              )}
              {plan.proteinAhead && week && (
                <p data-testid="suggest-protein-ahead">
                  {t('suggest.proteinAheadNote', { ahead: fmt(week.proteinG + left.proteinG), protein: fmt(left.proteinG) })}
                </p>
              )}
              {!plan.primary && projection(LIGHT_SNACK_MAX_KCAL) && (
                <p data-testid="suggest-projection">{projection(LIGHT_SNACK_MAX_KCAL)}</p>
              )}
            </div>
          )}
          {plan?.kind === 'WAIT' && (
            <p data-testid="suggest-stop">{t('suggest.waitBody', { kcal: fmt(plan.kcal) })}</p>
          )}
          {plan?.kind === 'FILL' && toCome.length > 0 && (
            <p data-testid="suggest-to-come">
              {t(toCome.length === 1 ? 'suggest.toComeOne' : 'suggest.toComeMany', {
                meals: slotsWords(toCome.map((meal) => meal.slot)),
                kcal: fmt(toCome.reduce((sum, meal) => sum + meal.usualKcal, 0)),
                max: fmt(plan.maxKcal),
              })}
            </p>
          )}
          {context?.today.answers.completeness === 'INCOMPLETE' && (
            <p data-testid="suggest-today-incomplete">{t('suggest.todayIncomplete')}</p>
          )}
          {credit && <p data-testid="suggest-credit">{t('suggest.trainingCredit', { extra: fmt(credit.extraKcal), credit: fmt(credit.creditKcal) })}</p>}
          {trainedMinutes > 0 && (
            <p data-testid="suggest-training">
              {t(refuel ? 'suggest.trainedEndurance' : strength ? 'suggest.trainedStrength' : 'suggest.trained', {
                minutes: fmt(trainedMinutes),
              })}
            </p>
          )}
          {sitting && left.proteinG > sitting.maxG && (
            <p data-testid="suggest-sitting">{t('suggest.perSitting', { gap: fmt(left.proteinG), max: fmt(sitting.maxG) })}</p>
          )}
          {lowFat && week && <p data-testid="suggest-fat-low">{t('suggest.fatLow', { avg: fmt(week.fatEatenG / week.days) })}</p>}
          {plan?.kind === 'FILL' && plan.bedtime && toBed !== undefined && context?.bedtime && (
            <p data-testid="suggest-bedtime">
              {t('suggest.bedtime', { time: duration(toBed), bedtime: context.bedtime, max: fmt(plan.maxKcal) })}
            </p>
          )}
          {state.kind === 'idle' && (plan?.kind === 'FILL' || (plan?.kind === 'USED' && plan.primary)) && (
            <>
              {noteOpen ? (
                <div className="pt-1">
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
                    className="w-full rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setNoteOpen(true)} className="justify-self-start underline underline-offset-2">
                  {t('suggest.addNote')}
                </button>
              )}
            </>
          )}
          <p className="text-xs text-ink-muted">{newcomer ? t('suggest.newcomer') : t('suggest.costs')}</p>
        </div>
      )}

      {state.kind === 'question' && (
        <div className="mt-3 rounded-2xl bg-surface px-4 py-3 text-sm leading-relaxed" data-testid="suggest-question">
          {state.question.kind === 'MISSING' ? (
            <>
              <p className="font-semibold">
                {t('suggest.qMissing', { meal: t(`common.slotLabel.${state.question.meal.slot}` as StringKey) })}
              </p>
              <div className="flex flex-wrap gap-2 pt-2.5">
                {state.question.meal.usual && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const missing = (state.question as { meal: MissingMeal }).meal
                      setBusy(true)
                      void logRepeat(missing.usual!, missing.slot).then((meal) => {
                        setBusy(false)
                        if (meal) {
                          setState({
                            kind: 'idle',
                            added: t('suggest.addedUsual', { meal: t(`common.slotLabel.${missing.slot}` as StringKey) }),
                          })
                        }
                      })
                    }}
                    className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-canvas"
                  >
                    {t('suggest.qAddUsual', {
                      meal: t(`common.slotLabel.${state.question.meal.slot}` as StringKey),
                      kcal: fmt(state.question.meal.usualKcal),
                    })}
                  </button>
                )}
                <Link to="/log" className="rounded-full border border-hairline px-4 py-1.5 text-sm">
                  {t('suggest.qLogNow')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const { meal } = state.question as { meal: MissingMeal }
                    const want = state.want
                    void (today ? recordDayCheck(today, { skipped: meal.slot }) : Promise.resolve(true)).then(() =>
                      ask(want, false, true),
                    )
                  }}
                  className="rounded-full border border-hairline px-4 py-1.5 text-sm"
                >
                  {t('suggest.qSkipped')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-semibold">
                {t('suggest.qLow', { eaten: fmt(eaten.energyKcal), target: fmt(targets.energyKcal) })}
              </p>
              {state.question.warned && <p className="pt-1 text-ink-soft">{t('suggest.qLowWarn')}</p>}
              <div className="flex flex-wrap gap-2 pt-2.5">
                {state.question.warned ? (
                  <>
                    <Link to="/log" className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-canvas">
                      {t('suggest.qLogNow')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void ask(state.want, false, true)}
                      className="rounded-full border border-hairline px-4 py-1.5 text-sm"
                    >
                      {t('suggest.qLowContinue')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const want = state.want
                        void (today ? recordDayCheck(today, { completeness: 'COMPLETE' }) : Promise.resolve(true)).then(() =>
                          ask(want, false, true),
                        )
                      }}
                      className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-canvas"
                    >
                      {t('suggest.qLowYes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const want = state.want
                        void (today ? recordDayCheck(today, { completeness: 'INCOMPLETE' }) : Promise.resolve(true)).then(() =>
                          setState({ kind: 'question', question: { kind: 'LOW', warned: true }, want }),
                        )
                      }}
                      className="rounded-full border border-hairline px-4 py-1.5 text-sm"
                    >
                      {t('suggest.qLowNo')}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <button type="button" onClick={() => setState({ kind: 'idle' })} className="mt-2.5 text-xs text-ink-muted underline">
            {t('suggest.qNotNow')}
          </button>
        </div>
      )}

      {state.kind === 'running' && (
        <div role="status" aria-live="polite" className="pt-3">
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
        <section aria-labelledby="suggest-title" className="pt-3">
          {/* h2: on Nutrition it sits under the page's h1, with no h2 between. */}
          <h2 id="suggest-title" className="text-sm font-semibold">
            {asked?.light
              ? t('suggest.forLight', { kcal: fmt(asked.maxKcal) })
              : asked?.kind === 'PROTEIN'
                ? t('suggest.forProtein', { kcal: fmt(asked.maxKcal) })
                : t('suggest.for', { left: leftWords })}
          </h2>
          {state.answer.note && <p className="pt-2 text-sm text-ink-soft">{state.answer.note}</p>}
          {newcomer && <p className="pt-2 text-xs text-ink-muted">{t('suggest.newcomer')}</p>}
          <ul className="grid gap-2.5 pt-3">
            {state.answer.suggestions.map((suggestion, index) => {
              const fit = fitOf(suggestion, progress, asked?.kind === 'PROTEIN' ? balance : undefined)
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
                    className={`pt-1 text-[12.5px] font-semibold ${fit.spareKcal >= 0 || fit.statusAfter !== 'ABOVE' ? 'text-ink' : 'text-ink-soft'}`}
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
                    {fit.balanceAfter !== undefined &&
                      fit.statusAfter &&
                      ` · ${
                        plan?.kind === 'USED' && plan.scope === 'WEEK' && week
                          ? t('suggest.fitDays', { days: fmt(week.days), after: signed(fit.balanceAfter), status: statusWords(fit.statusAfter) })
                          : t('suggest.fitToday', { after: signed(fit.balanceAfter), status: statusWords(fit.statusAfter) })
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
            <button
              type="button"
              onClick={() => asked && void ask(asked, true)}
              className="rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm"
            >
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
        <div role="status" aria-live="polite" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-leaf-soft px-4 py-3 text-sm">
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
              onClick={() => void deleteMeal(state.meal!).then((ok) => ok && setState({ ...state, undone: true }))}
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
        <div role="alert" className="mt-3 rounded-2xl bg-surface px-4 py-3 text-sm leading-relaxed">
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
              <button type="button" onClick={() => asked && void ask(asked, true)} className="mt-2 font-medium underline underline-offset-2">
                {t('common.retry')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )

  /** The period: its dates, the days counted, the balance against plan, and why. The macros are on the week page. */
  function periodBlock() {
    if (!week) return null
    const flagged = week.excluded.filter((day) => day.reason === 'UNANSWERED')
    const marked = week.excluded.filter((day) => day.reason === 'INCOMPLETE')
    const range = planRange(week.balanceKcal, week.budgetKcal)
    const objective = targets.objective
    return (
      <div data-testid="suggest-week">
        <p className="pb-1 text-xs font-semibold text-ink-muted" data-testid="suggest-period">
          {t('suggest.period', {
            from: dateOf(week.from),
            to: dateOf(week.to),
            counted: fmt(week.days),
            days: fmt(week.periodDays),
          })}
        </p>
        {week.sparse ? (
          <p className="text-[13px] text-ink-soft" data-testid="suggest-sparse">
            {t('suggest.sparse')}
          </p>
        ) : (
          <>
            {/* The plan range on a line of its own: a value this long squeezes a label beside it. */}
            <p className="pb-1 text-[13px]">
              <span className="text-ink-soft">{t('suggest.againstPlan')}: </span>
              <span className="tabular font-semibold" data-testid="suggest-range">
                {t(`suggest.range.${range.status}` as StringKey, { balance: signed(week.balanceKcal), range: fmt(range.rangeKcal) })}
              </span>
            </p>
            <details className="pt-1.5 text-[12px] text-ink-soft" data-testid="suggest-why">
              <summary className="cursor-pointer underline underline-offset-2">{t('suggest.why')}</summary>
              <div className="grid gap-1 pt-1.5 leading-relaxed">
                {week.before && (
                  <>
                    <p>
                      {t('suggest.whyBurn', {
                        period: `${dateOf(week.before.from)} – ${dateOf(week.before.to)}`,
                        eaten: fmt(week.before.eatenKcal),
                        burned: fmt(week.before.expenditureKcal),
                        diff: signed(week.before.eatenKcal - week.before.expenditureKcal),
                      })}
                    </p>
                    {week.before.plannedKcal !== 0 && (
                      <p>
                        {t(week.before.plannedKcal > 0 ? 'suggest.whyPlannedUnder' : 'suggest.whyPlannedOver', {
                          planned: fmt(Math.abs(week.before.plannedKcal)),
                          perDay: fmt(Math.abs(week.before.plannedKcal / week.before.days)),
                          goal: objective ? t(`objective.${objective}` as StringKey) : '',
                          diff: signed(week.before.eatenKcal - week.before.budgetKcal),
                        })}
                      </p>
                    )}
                  </>
                )}
                {week.today.targetKcal !== undefined && (
                  <p>
                    {t('suggest.whyToday', {
                      date: dateOf(week.today.day),
                      eaten: fmt(week.today.eatenKcal),
                      target: fmt(week.today.targetKcal),
                      diff: signed(week.today.eatenKcal - week.today.targetKcal),
                    })}
                  </p>
                )}
                <p className="font-semibold text-ink">
                  {t('suggest.whyTotal', { period: `${dateOf(week.from)} – ${dateOf(week.to)}`, diff: signed(week.balanceKcal) })}
                </p>
              </div>
            </details>
          </>
        )}
        {flagged.map((day) => (
          <div key={day.day} className="mt-2 rounded-lg bg-surface px-3 py-2 text-[12.5px]" data-testid="suggest-flag">
            <p>
              {t('suggest.flagged', { date: dateOf(day.day), kcal: fmt(day.eatenKcal) })}{' '}
              <span className="text-ink-muted">{t('suggest.flagNote')}</span>
            </p>
            <div className="flex flex-wrap gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => void recordDayCheck(day.day, { completeness: 'COMPLETE' })}
                className="rounded-full border border-hairline px-3 py-1"
              >
                {t('suggest.flagYes')}
              </button>
              <button
                type="button"
                onClick={() => void recordDayCheck(day.day, { completeness: 'INCOMPLETE' })}
                className="rounded-full border border-hairline px-3 py-1"
              >
                {t('suggest.flagNo')}
              </button>
            </div>
          </div>
        ))}
        {marked.map((day) => (
          <p key={day.day} className="pt-1.5 text-[12px] text-ink-muted" data-testid="suggest-marked">
            {t('suggest.markedIncomplete', { date: dateOf(day.day) })}{' '}
            <button type="button" onClick={() => void recordDayCheck(day.day, { completeness: 'UNSET' })} className="underline">
              {t('suggest.undo')}
            </button>
          </p>
        ))}
        {week.measuredDays > 0 && !week.sparse && (
          <p className="pt-1 text-[11.5px] text-ink-muted">{t('suggest.weekMeasured')}</p>
        )}
      </div>
    )
  }
}

const hhmm = (at: Date) => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

function InfoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5v.01" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
    </svg>
  )
}
