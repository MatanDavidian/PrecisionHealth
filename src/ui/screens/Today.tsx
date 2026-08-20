import { Link } from 'react-router-dom'
import { Card, StatRow } from '../components/Card'
import { ProvenanceBadge } from '../components/ProvenanceBadge'
import { ConflictNotice } from '../components/ConflictNotice'
import { show, showDuration, showNumber } from '../format'
import { today, useActions, useDay } from '../useHealthData'
import { evaluateGoal } from '@/data/analytics'
import { convert } from '@/domain'

export function Today() {
  const day = today()
  const data = useDay(day)
  const { resolveConflict } = useActions()

  if (!data) return <p className="text-sm text-ink-muted">Loading your day…</p>

  const { nutrients, workouts, sleep, effective, conflicts, goals, unconfirmed } = data
  const workout = workouts[0]
  const proteinGoal = goals.find((g) => g.metric === 'PROTEIN')
  const proteinProgress = proteinGoal ? evaluateGoal(proteinGoal, nutrients.protein.value) : undefined
  const weightConflict = conflicts.find((c) => c.effective.code === 'WEIGHT')

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="font-display text-4xl">Today</h1>
          <p className="pt-1 text-sm text-ink-muted">{day}</p>
        </div>
        <Link
          to="/nutrition"
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
        >
          Log a meal
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card label="Nutrition">
          <StatRow name="Calories" value={showNumber(nutrients.energy, 'kcal')} />
          <StatRow
            name="Protein"
            value={
              proteinGoal
                ? `${showNumber(nutrients.protein, 'g')} / ${showNumber(proteinGoal.target, 'g')} g`
                : show(nutrients.protein, 'g')
            }
            tone={proteinProgress?.attained ? 'good' : undefined}
          />
          <StatRow name="Carbs" value={show(nutrients.carbs, 'g')} />
          <StatRow name="Fat" value={show(nutrients.fat, 'g')} />
          {unconfirmed.length > 0 && (
            <p className="pt-3 text-xs text-ink-muted">
              {unconfirmed.length === 1 ? 'One item is' : `${unconfirmed.length} items are`} an
              unconfirmed AI estimate —{' '}
              <Link to="/nutrition" className="underline">
                review in Nutrition
              </Link>
              .
            </p>
          )}
        </Card>

        <Card label="Activity">
          <StatRow name="Steps" value={effective.STEPS ? showNumber(effective.STEPS.value, 'count') : '—'} />
          <StatRow
            name="Workout"
            value={workout ? `Strength · ${showNumber(workout.duration, 'min')} min` : 'Rest day'}
          />
          <StatRow
            name="Active kcal"
            value={effective.ACTIVE_ENERGY ? showNumber(effective.ACTIVE_ENERGY.value, 'kcal') : '—'}
          />
        </Card>

        <Card label="Recovery">
          <StatRow name="Sleep" value={sleep ? showDuration(sleep.duration) : '—'} />
          <StatRow name="HRV" value={effective.HRV ? show(effective.HRV.value, 'ms') : '—'} />
          <StatRow
            name="Resting HR"
            value={effective.RESTING_HEART_RATE ? show(effective.RESTING_HEART_RATE.value, 'bpm') : '—'}
          />
        </Card>

        <Card label="Body">
          <StatRow name="Weight" value={effective.WEIGHT ? show(effective.WEIGHT.value, 'kg', 1) : '—'} />
          <StatRow name="Body fat" value={effective.BODY_FAT ? show(effective.BODY_FAT.value, '%', 1) : '—'} />
          {weightConflict && (
            <ConflictNotice
              conflict={weightConflict}
              unit="kg"
              onChoose={(chosen) => void resolveConflict(chosen, data.candidates.WEIGHT ?? [])}
            />
          )}
        </Card>

        <Card label="Meals">
          {data.meals.length === 0 && (
            <p className="py-1.5 text-sm text-ink-muted">Nothing logged yet today.</p>
          )}
          {data.meals.map((meal) => {
            const kcal = meal.items.reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0)
            const estimate = meal.items.find((item) => item.provenance.source === 'AI_ESTIMATE')
            return (
              <div key={meal.id} className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="text-sm text-ink-muted">
                  {meal.slot.charAt(0) + meal.slot.slice(1).toLowerCase()}
                  {estimate && <ProvenanceBadge provenance={estimate.provenance} />}
                </span>
                <span className="tabular text-sm font-medium">{Math.round(kcal)} kcal</span>
              </div>
            )
          })}
        </Card>

        <Card tone="leaf">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf">AI</p>
          <h2 className="pt-2 font-display text-xl">See what changed this week</h2>
          <p className="pt-1 text-sm text-ink-muted">
            Runs later, once there is enough history to compare against.
          </p>
        </Card>
      </div>
    </div>
  )
}
