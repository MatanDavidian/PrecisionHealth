import { Link } from 'react-router-dom'
import { Card, StatRow } from '../components/Card'
import { ProvenanceBadge } from '../components/ProvenanceBadge'
import { ConflictNotice } from '../components/ConflictNotice'
import { show, showDuration, showNumber } from '../format'
import { useActions, useDay } from '../useHealthData'
import { useSelectedDay, dayLabel } from '../useSelectedDay'
import { DayNav } from '../components/DayNav'
import { DataUnavailable } from '../components/DataUnavailable'
import { AdoptionPrompt } from '../components/AdoptionPrompt'
import { useDataRevision } from '../DataProvider'
import { evaluateGoal } from '@/data/analytics'
import { convert, goalFor } from '@/domain'
import { useT } from '../i18n'
import { EditableStat } from '../components/EditableStat'
import { WeightGoal } from '../components/WeightGoal'
import type { StringKey } from '../i18n/strings'

export function Today() {
  const t = useT()
  const selected = useSelectedDay()
  const { day, today, isToday } = selected
  const { data, error, retry } = useDay(day)
  const { resolveConflict, recordObservation, setGoal } = useActions()
  const { session } = useDataRevision()

  if (error) return <DataUnavailable error={error} onRetry={retry} signedIn={session.authenticated} />
  if (!data) return <p className="text-sm text-ink-muted">{t('usuals.looking')}</p>

  const { nutrients, workouts, sleep, effective, conflicts, goals, unconfirmed } = data
  const workout = workouts[0]
  const proteinGoal = goals.find((g) => g.metric === 'PROTEIN')
  const proteinProgress = proteinGoal ? evaluateGoal(proteinGoal, nutrients.protein.value) : undefined
  const weightConflict = conflicts.find((c) => c.effective.code === 'WEIGHT')

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="font-display text-4xl">{dayLabel(day, today, t)}</h1>
          <p className="pt-1 text-sm text-ink-muted">{day}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DayNav
            day={day}
            today={today}
            isToday={isToday}
            onPrevious={selected.goPrevious}
            onNext={selected.goNext}
            onToday={selected.goToday}
          />
          <Link
            to="/log"
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
          >
            {t('today.logAMeal')}
          </Link>
        </div>
      </header>

      <AdoptionPrompt />

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
          <EditableStat
            name={t('today.activeKcal')}
            unit="kcal"
            hint={t('entry.energyHint')}
            value={effective.ACTIVE_ENERGY ? showNumber(effective.ACTIVE_ENERGY.value, 'kcal') : '—'}
            current={
              effective.ACTIVE_ENERGY ? convert(effective.ACTIVE_ENERGY.value, 'kcal') : undefined
            }
            onSave={(value) =>
              recordObservation({ code: 'ACTIVE_ENERGY', value, unit: 'kcal', day })
            }
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
          <EditableStat
            name={t('today.weight')}
            unit="kg"
            hint={t('entry.weightHint')}
            value={effective.WEIGHT ? show(effective.WEIGHT.value, 'kg', 1) : '—'}
            current={effective.WEIGHT ? convert(effective.WEIGHT.value, 'kg') : undefined}
            onSave={(value) => recordObservation({ code: 'WEIGHT', value, unit: 'kg', day })}
          />
          <StatRow
            name={t('today.bodyFat')}
            value={effective.BODY_FAT ? show(effective.BODY_FAT.value, '%', 1) : '—'}
          />
          <WeightGoal
            goal={goalFor(goals, 'WEIGHT')}
            currentKg={effective.WEIGHT ? convert(effective.WEIGHT.value, 'kg') : undefined}
            onSet={(target, direction) =>
              setGoal({ metric: 'WEIGHT', target, unit: 'kg', direction })
            }
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

        <Card tone="leaf">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf">AI</p>
          <h2 className="pt-2 font-display text-xl">{t('today.aiTitle')}</h2>
          <p className="pt-1 text-sm text-ink-muted">{t('today.aiBody')}</p>
        </Card>
      </div>
    </div>
  )
}
