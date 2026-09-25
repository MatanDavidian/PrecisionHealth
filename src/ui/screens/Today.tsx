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
import { GapsCard } from '../components/GapsCard'
import { EstimatedTotals } from '../components/EstimatedTotals'
import { FilledNotice } from '../components/FilledNotice'
import { WeekNav } from '../components/WeekNav'
import { DataUnavailable } from '../components/DataUnavailable'
import { AdoptionPrompt } from '../components/AdoptionPrompt'
import { useDataRevision } from '../DataProvider'
import { evaluateGoal } from '@/data/analytics'
import {
  addDays,
  convert,
  dayKeyOf,
  findGaps,
  FILL_LOOKBACK_DAYS,
  goalFor,
  isObjective,
  latestVersions,
  typicalIntake,
  isPatternFilled,
  weekStartOf,
  type DayGap,
  type Meal,
  type TypicalIntake,
} from '@/domain'
import { useLang } from '../i18n'
import { InsightsCard, type InsightsState } from '../components/InsightsCard'
import { BurnedRow } from '../components/BurnedRow'
import { getEstimator, getRepositories } from '@/data'
import { buildInsightInference } from '@/data/estimatedMeal'
import { reportMealCount, type WeekReport } from '@/domain'
import { useNudged } from '../useNudged'
import {
  WeekView,
  weekStartLabel,
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
  const { resolveConflict, recordObservation, fillDayFromPattern, deleteMeals } = useActions()
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

  /**
   * Filling the week's blank days, and being able to take it back.
   *
   * `justFilled` holds what was written so Undo has records to retract — the
   * same shape as a whole-day repeat. It is deliberately not persisted: Undo
   * is for the seconds after a tap. Afterwards a filled day is corrected by
   * logging what was really eaten, which replaces the estimate.
   */
  const [gaps, setGaps] = useState<DayGap[]>([])
  const [typical, setTypical] = useState<TypicalIntake>()
  const [filling, setFilling] = useState(false)
  const [justFilled, setJustFilled] = useState<Meal[]>()

  useEffect(() => {
    if (view !== 'week' || !week) return
    let cancelled = false
    void (async () => {
      const history = await getRepositories().meals.listByRange(currentUserId(), {
        // As far back as a fill may draw from — the last fortnight of LOGGED
        // days can sit well before the last fortnight of the calendar.
        from: addDays(week.from, -FILL_LOOKBACK_DAYS),
        to: week.to,
      })
      if (cancelled) return
      const days = week.days.map((d) => d.day)
      const open = findGaps(days, latestVersions(history), today).filter((g) => !g.filled)
      setGaps(open)
      // Drawn for the FIRST gap: the average is the same either way, and
      // asking for one per gap would read the same history several times to
      // produce the same answer.
      setTypical(
        open.length
          ? typicalIntake(latestVersions(history), {
              source: 'RECENT',
              forDay: open[0].day,
            })
          : undefined,
      )
    })()
    return () => {
      cancelled = true
    }
  }, [view, week, today, revision])

  const fillGaps = async () => {
    if (!typical || gaps.length === 0) return
    setFilling(true)
    try {
      const written: Meal[] = []
      for (const gap of gaps) {
        written.push(...(await fillDayFromPattern(typical, gap.day)))
      }
      if (written.length) setJustFilled(written)
    } finally {
      setFilling(false)
    }
  }
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
  // A filled day's estimate is in the totals, never in the list of meals:
  // nobody logged it. (Once a real meal lands, `countedMeals` has already
  // taken the estimate out, so the two never appear together.)
  const logged = data.meals.filter((meal) => !isPatternFilled(meal))
  const estimatedDay = logged.length < data.meals.length

  return (
    <div className="mx-auto max-w-5xl">
      {/*
        The switch does not move when you use it.

        It used to: the day view carried a stepper the week view lacked, so the
        row's contents changed width with the view — wrapping differently on a
        phone, sliding the switch sideways on a desktop. Either way the control
        jumped out from under the finger that had just pressed it.

        Now both views carry a stepper — days in one, weeks in the other — and
        the two reserve the same width, so there is nothing left to move. On a
        phone the switch still takes a full-width row of its own above them.
      */}
      <header className="flex flex-col gap-3.5 pb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="font-display text-4xl">
            {/*
              Only the current week is "This week". Saying it over a week from
              three weeks ago is the same class of untruth as the totals card
              that said "Today's total" on every day.
            */}
            {view === 'week'
              ? weekStartOf(day) === weekStartOf(today)
                ? t('week.title')
                : t('week.weekOf', {
                    date: weekStartLabel(
                      weekStartOf(day),
                      document.documentElement.lang || undefined,
                    ),
                  })
              : dayLabel(day, today, t)}
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
            One stepper slot, moving whichever unit is on screen: days in the
            day view, weeks in the week view. Both reserve the same width, so
            switching between them cannot slide the Day/Week control sideways —
            the bug this header already had once.
          */}
          {view === 'week' ? (
            <WeekNav day={day} today={today} onGo={selected.goTo} />
          ) : (
            <DayNav
              day={day}
              today={today}
              isToday={isToday}
              onPrevious={selected.goPrevious}
              onNext={selected.goNext}
              onToday={selected.goToday}
            />
          )}
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
              gaps={
                <>
                  <GapsCard
                    gaps={gaps}
                    busy={filling}
                    canFill={typical !== undefined}
                    basis={
                      typical
                        ? { count: typical.drawnFrom, from: typical.from, to: typical.to }
                        : undefined
                    }
                    onFill={() => void fillGaps()}
                    formatDay={(d) =>
                      new Date(`${d}T12:00:00Z`).toLocaleDateString(
                        document.documentElement.lang || undefined,
                        { weekday: 'short', day: 'numeric' },
                      )
                    }
                  />
                  {justFilled && justFilled.length > 0 && (
                    <FilledNotice
                      days={new Set(justFilled.map((m) => dayKeyOf(m.time))).size}
                      onUndo={() => {
                        void deleteMeals(justFilled)
                        setJustFilled(undefined)
                      }}
                    />
                  )}
                </>
              }
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
          {estimatedDay && <EstimatedTotals />}
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
          {logged.length === 0 && (
            <p className="py-1.5 text-sm text-ink-muted">
              {isToday ? t('today.nothingToday') : t('today.nothingThatDay')}
            </p>
          )}
          {logged.map((meal) => {
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
