import { Card, StatRow } from '../components/Card'
import { ProvenanceBadge } from '../components/ProvenanceBadge'
import { useToday } from '../useHealthData'
import type { Goal, Observation } from '@/domain'

const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`

const findObs = (observations: Observation[], code: Observation['code']) =>
  observations.find((o) => o.code === code)

const goalFor = (goals: Goal[], metric: Goal['metric']) => goals.find((g) => g.metric === metric)

export function Today() {
  const data = useToday()

  if (!data) {
    return <p className="text-sm text-ink-muted">Loading your day…</p>
  }

  const { nutrients, workouts, sleep, observations, measurements, goals } = data
  const steps = findObs(observations, 'STEPS')
  const activeEnergy = findObs(observations, 'ACTIVE_ENERGY')
  const hrv = findObs(observations, 'HRV')
  const rhr = findObs(observations, 'RESTING_HEART_RATE')
  const weight = measurements.find((m) => m.code === 'WEIGHT')
  const bodyFat = measurements.find((m) => m.code === 'BODY_FAT')
  const proteinGoal = goalFor(goals, 'PROTEIN')
  const workout = workouts[0]

  return (
    <div className="mx-auto max-w-5xl">
      <header className="pb-6">
        <h1 className="font-display text-4xl">Good evening</h1>
        <p className="pt-1 text-sm text-ink-muted">Tuesday, August 18</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card label="Nutrition">
          <StatRow name="Calories" value={`${nutrients.energy.value.toLocaleString()}`} />
          <StatRow
            name="Protein"
            value={
              proteinGoal
                ? `${nutrients.protein.value} / ${proteinGoal.target.value} g`
                : `${nutrients.protein.value} g`
            }
          />
          <StatRow name="Carbs" value={`${nutrients.carbs.value} g`} />
          <StatRow name="Fat" value={`${nutrients.fat.value} g`} />
          {data.estimatesPending && (
            <p className="pt-3 text-xs text-ink-muted">
              Contains an unconfirmed AI estimate — open Nutrition to confirm.
            </p>
          )}
        </Card>

        <Card label="Activity">
          <StatRow name="Steps" value={steps ? steps.value.value.toLocaleString() : '—'} />
          <StatRow
            name="Workout"
            value={workout ? `Strength · ${workout.duration.value} min` : 'Rest day'}
          />
          <StatRow
            name="Active kcal"
            value={activeEnergy ? `${activeEnergy.value.value}` : '—'}
          />
        </Card>

        <Card label="Recovery">
          <StatRow name="Sleep" value={sleep ? hhmm(sleep.duration.value) : '—'} />
          <StatRow name="HRV" value={hrv ? `${hrv.value.value} ms` : '—'} />
          <StatRow name="Resting HR" value={rhr ? `${rhr.value.value} bpm` : '—'} />
        </Card>

        <Card label="Body">
          <StatRow name="Weight" value={weight ? `${weight.value.value} kg` : '—'} />
          <StatRow name="Body fat" value={bodyFat ? `${bodyFat.value.value} %` : '—'} />
        </Card>

        <Card label="Meals">
          {data.meals.map((meal) => {
            const kcal = meal.items.reduce((sum, item) => sum + item.nutrients.energy.value, 0)
            const estimate = meal.items.find((item) => item.provenance.source === 'AI_ESTIMATE')
            return (
              <div key={meal.id} className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="text-sm text-ink-muted">
                  {meal.slot.charAt(0) + meal.slot.slice(1).toLowerCase()}
                  {estimate && <ProvenanceBadge provenance={estimate.provenance} />}
                </span>
                <span className="tabular text-sm font-medium">{kcal} kcal</span>
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
