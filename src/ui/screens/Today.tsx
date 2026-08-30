import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, StatRow } from '../components/Card'
import { ProvenanceBadge } from '../components/ProvenanceBadge'
import { ConflictNotice } from '../components/ConflictNotice'
import { show, showDuration, showNumber } from '../format'
import { useActions, useDay } from '../useHealthData'
import { useSelectedDay, dayLabel } from '../useSelectedDay'
import { DayNav } from '../components/DayNav'
import { PILL, PILL_OFF, PILL_ON } from '../components/segmented'
import { DataUnavailable } from '../components/DataUnavailable'
import { AdoptionPrompt } from '../components/AdoptionPrompt'
import { useDataRevision } from '../DataProvider'
import { evaluateGoal } from '@/data/analytics'
import { convert, goalFor, isObjective } from '@/domain'
import { useLang } from '../i18n'
import { InsightsCard, type InsightsState } from '../components/InsightsCard'
import { BurnedRow } from '../components/BurnedRow'
import { getEstimator, getRepositories } from '@/data'
import { buildInsightInference } from '@/data/estimatedMeal'
import { reportMealCount, type WeekReport } from '@/domain'
import { useNudged } from '../useNudged'
import {
  WeekView,
  WeekTeaser,
  WeekBlocked,
  weekBlocker,
  weekRangeLabel,
} from '../components/WeekView'
import { readWeek, readWeekReport } from '@/data/week'
import type { WeekEnergy } from '@/domain'
import { currentUserId } from '@/data/session'
import { useSearchParams } from 'react-router-dom'
import type { StringKey } from '../i18n/strings'

export function Today() {
  const { t, lang } = useLang()
  const [params, setParams] = useSearchParams()
  /**
   * Day or week, held in the URL so the choice survives a reload and can be
   * linked to — the same reasoning as the Log screen's three modes.
   */
  const view = params.get('view') === 'week' ? 'week' : 'day'
  const setView = (next: 'day' | 'week') => {
    const updated = new URLSearchParams(params)
    if (next === 'day') updated.delete('view')
    else updated.set('view', next)
    setParams(updated, { replace: true })
  }
  const selected = useSelectedDay()
  const { day, today, isToday } = selected
  const { data, error, retry } = useDay(day)
  const { resolveConflict, recordObservation } = useActions()
  const { session, revision } = useDataRevision()

  /*
    Everything the plan card needs, derived BEFORE the early returns below.
    Hooks cannot live after a conditional return — the first render bails out
    while the day loads, and the next one would call three more of them.
  */
  const loaded = data?.effective
  const goals = data?.goals ?? []
  const weightTarget = goalFor(goals, 'WEIGHT')
  const energyGoal = goalFor(goals, 'ENERGY')
  const objective = isObjective(energyGoal?.objective) ? energyGoal.objective : undefined

  /*
    Weight and target are READ here, not edited — they live in Settings now,
    because they are facts about a person rather than about a day. They are
    still gathered because the week report carries them as context.
  */
  const weightKg = loaded?.WEIGHT ? convert(loaded.WEIGHT.value, 'kg') : undefined
  const targetKg = weightTarget ? convert(weightTarget.target, 'kg') : undefined

  // Nudging is per-tap; the store hears the number the user settled on.
  const [burnedKcal, nudgeBurned] = useNudged(
    loaded?.TOTAL_ENERGY ? convert(loaded.TOTAL_ENERGY.value, 'kcal') : undefined,
    (kcal) => void recordObservation({ code: 'TOTAL_ENERGY', value: kcal, unit: 'kcal', day }),
  )
  /**
   * The week, loaded only when it is being looked at.
   *
   * Seven days is eight reads; doing them on every day view to fill a card
   * nobody opened would be paying for the feature whether or not it is used.
   */
  const [week, setWeek] = useState<WeekEnergy>()
  useEffect(() => {
    if (view !== 'week') return
    let cancelled = false
    void readWeek(currentUserId(), day, objective, getRepositories())
      .then((result) => !cancelled && setWeek(result))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [view, day, objective, revision])

  /**
   * The insights request, and the payload it would send.
   *
   * The report is built as soon as the week is, so the card can say how many
   * meals are about to leave the device BEFORE anyone agrees to send them.
   * Building it costs one extra read and buys a specific promise instead of a
   * vague one.
   */
  const [insights, setInsights] = useState<InsightsState>({ kind: 'idle' })
  const [report, setReport] = useState<WeekReport>()
  useEffect(() => {
    if (view !== 'week') return
    let cancelled = false
    void readWeekReport(currentUserId(), day, objective, { weightKg, targetKg }, getRepositories())
      .then((built) => !cancelled && setReport(built))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // Deliberately not keyed on weight/target: they only decorate the payload,
    // and rebuilding it on every stepper tap would be work nobody asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, day, objective, revision])

  /** Asks, records the attempt either way, and keeps the answer on screen. */
  const askForInsights = async () => {
    if (!report) return
    setInsights({ kind: 'running' })
    try {
      const insight = await getEstimator().weekInsights(report, { language: lang })
      setInsights({ kind: 'done', insight, at: Date.now() })
      // The audit trail applies here exactly as it does to an estimate (D13):
      // advice the app gave must be answerable for later.
      await getRepositories()
        .inferences.add(buildInsightInference(currentUserId(), report, insight))
        .catch(() => undefined)
    } catch (cause) {
      setInsights({
        kind: 'failed',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }


  if (error) return <DataUnavailable error={error} onRetry={retry} signedIn={session.authenticated} />
  if (!data) return <p className="text-sm text-ink-muted">{t('usuals.looking')}</p>

  const { nutrients, workouts, sleep, conflicts, unconfirmed, effective } = data
  const workout = workouts[0]
  const proteinGoal = goals.find((g) => g.metric === 'PROTEIN')
  const proteinProgress = proteinGoal ? evaluateGoal(proteinGoal, nutrients.protein.value) : undefined
  const weightConflict = conflicts.find((c) => c.effective.code === 'WEIGHT')

  return (
    <div className="mx-auto max-w-5xl">
      {/*
        The switch does not move when you use it.

        It used to. The day view carries a date stepper beside the switch and
        the week view does not, so the row's contents changed width with the
        view — which on a phone made it wrap differently, and on a desktop slid
        the switch sideways. Either way the control jumped out from under the
        finger that had just pressed it, and the page appeared to rebuild
        itself. Both halves are fixed here rather than in CSS alone: on a phone
        the switch is a full-width row of its own with the stepper BELOW it, so
        the stepper's coming and going cannot reach it; from `sm` up the
        stepper keeps its space in the row even in the week view, where it is
        present but inert.
      */}
      <header className="flex flex-col gap-3.5 pb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="font-display text-4xl">
            {view === 'week' ? t('week.title') : dayLabel(day, today, t)}
          </h1>
          <p className="pt-1 text-sm text-ink-muted">
            {view === 'week' && week
              ? weekRangeLabel(week.from, week.to, document.documentElement.lang || undefined)
              : day}
          </p>
        </div>
        <div className="flex flex-col gap-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {/*
            Filled and full-width on a phone, where it is the same shape as the
            Log tabs and the Settings tabs; outlined and only as wide as its two
            words from `sm` up, where it sits beside the date stepper.
          */}
          <div className="flex gap-1.5 rounded-full bg-card p-1 sm:gap-0.5 sm:border sm:border-hairline sm:bg-transparent sm:p-0.5">
            {(['day', 'week'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                aria-pressed={view === option}
                className={`flex-1 py-2 max-sm:text-[13px] sm:flex-none sm:px-4 sm:py-1.5 ${PILL} ${
                  view === option ? PILL_ON : PILL_OFF
                }`}
              >
                {t(option === 'day' ? 'week.day' : 'week.week')}
              </button>
            ))}
          </div>
          {/*
            Dropped on a phone, where it sits below the switch and so cannot
            disturb it. Kept but inert from `sm` up, where removing it would
            let the switch slide across.
          */}
          <div
            className={view === 'day' ? undefined : 'max-sm:hidden sm:invisible'}
            aria-hidden={view !== 'day'}
            /* `inert` is the right primitive for "present but not there" — it
               takes the stepper out of the focus order and the accessibility
               tree, so an invisible control cannot be tabbed into. React 18's
               DOM typings predate it, hence the plain attribute. */
            {...(view === 'day' ? {} : ({ inert: '' } as Record<string, string>))}
          >
            <DayNav
              day={day}
              today={today}
              isToday={isToday}
              onPrevious={selected.goPrevious}
              onNext={selected.goNext}
              onToday={selected.goToday}
            />
          </div>
        </div>
      </header>

      <AdoptionPrompt />

      {view === 'week' ? (
        week ? (
          weekBlocker(week, objective) ? (
            <WeekBlocked
              blocker={weekBlocker(week, objective)!}
              onGo={() => setView('day')}
            />
          ) : (
            <WeekView
              week={week}
              objective={objective}
              insights={
                <InsightsCard
                  state={insights}
                  mealCount={report ? reportMealCount(report) : 0}
                  onAsk={() => void askForInsights()}
                  onDismiss={() => setInsights({ kind: 'idle' })}
                />
              }
            />
          )
        ) : (
          <p className="text-sm text-ink-muted">{t('usuals.looking')}</p>
        )
      ) : (
        <>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card label={t('today.nutrition')}>
          <StatRow name={t('estimate.calories')} value={showNumber(nutrients.energy, 'kcal')} />
          <StatRow
            name={t('estimate.protein')}
            value={
              proteinGoal
                ? `${showNumber(nutrients.protein, 'g')} / ${showNumber(proteinGoal.target, 'g')} g`
                : show(nutrients.protein, 'g')
            }
            tone={proteinProgress?.attained ? 'good' : undefined}
          />
          <StatRow name={t('estimate.carbs')} value={show(nutrients.carbs, 'g')} />
          <StatRow name={t('estimate.fat')} value={show(nutrients.fat, 'g')} />
          {unconfirmed.length > 0 && (
            <p className="pt-3 text-xs text-ink-muted">
              {t('today.unconfirmed', { count: unconfirmed.length })}{' '}
              <Link to="/nutrition" className="underline">
                {t('today.reviewInNutrition')}
              </Link>
              .
            </p>
          )}
        </Card>

        <Card label={t('today.activity')}>
          <StatRow
            name={t('today.steps')}
            value={effective.STEPS ? showNumber(effective.STEPS.value, 'count') : '—'}
          />
          <StatRow
            name={t('today.workout')}
            value={
              workout
                ? t('today.strength', { minutes: showNumber(workout.duration, 'min') })
                : t('today.restDay')
            }
          />
          <StatRow
            name={t('today.activeKcal')}
            value={effective.ACTIVE_ENERGY ? showNumber(effective.ACTIVE_ENERGY.value, 'kcal') : '—'}
          />
          <BurnedRow
            kcal={burnedKcal}
            trackerKcal={
              effective.ACTIVE_ENERGY ? convert(effective.ACTIVE_ENERGY.value, 'kcal') : undefined
            }
            onChange={nudgeBurned}
          />
        </Card>

        <Card label={t('today.recovery')}>
          <StatRow name={t('today.sleep')} value={sleep ? showDuration(sleep.duration) : '—'} />
          <StatRow name={t('today.hrv')} value={effective.HRV ? show(effective.HRV.value, 'ms') : '—'} />
          <StatRow
            name={t('today.restingHr')}
            value={effective.RESTING_HEART_RATE ? show(effective.RESTING_HEART_RATE.value, 'bpm') : '—'}
          />
        </Card>

        <Card label={t('today.body')}>
          <StatRow
            name={t('today.weight')}
            value={effective.WEIGHT ? show(effective.WEIGHT.value, 'kg', 1) : '—'}
          />
          <StatRow
            name={t('today.bodyFat')}
            value={effective.BODY_FAT ? show(effective.BODY_FAT.value, '%', 1) : '—'}
          />
          {weightConflict && (
            <ConflictNotice
              conflict={weightConflict}
              unit="kg"
              onChoose={(chosen) => void resolveConflict(chosen, data.candidates.WEIGHT ?? [])}
            />
          )}
        </Card>

        <Card label={t('today.meals')}>
          {data.meals.length === 0 && (
            <p className="py-1.5 text-sm text-ink-muted">
              {isToday ? t('today.nothingToday') : t('today.nothingThatDay')}
            </p>
          )}
          {data.meals.map((meal) => {
            const kcal = meal.items.reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0)
            const estimate = meal.items.find((item) => item.provenance.source === 'AI_ESTIMATE')
            return (
              <div key={meal.id} className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="text-sm text-ink-muted">
                  {t(`common.slot.${meal.slot}` as StringKey)}
                  {estimate && <ProvenanceBadge provenance={estimate.provenance} />}
                </span>
                <span className="tabular ltr-nums text-sm font-medium">
                  {Math.round(kcal)} kcal
                </span>
              </div>
            )
          })}
        </Card>

        <WeekTeaser onOpen={() => setView('week')} />
      </div>
        </>
      )}
    </div>
  )
}
