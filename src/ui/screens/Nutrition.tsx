import { Card } from '../components/Card'
import { MealForm } from '../components/MealForm'
import { ProvenanceBadge } from '../components/ProvenanceBadge'
import { show, showNumber } from '../format'
import { useActions, useDay } from '../useHealthData'
import { useSelectedDay, dayLabel } from '../useSelectedDay'
import { DayNav } from '../components/DayNav'
import { evaluateGoal } from '@/data/analytics'
import { convert, needsConfirmation, type Meal } from '@/domain'

export function Nutrition() {
  const selected = useSelectedDay()
  const { day, today, isToday } = selected
  const data = useDay(day)
  const { addMeal, confirmEstimate } = useActions()

  if (!data) return <p className="text-sm text-ink-muted">Loading…</p>

  const { nutrients, meals, goals } = data
  const proteinGoal = goals.find((g) => g.metric === 'PROTEIN')
  const progress = proteinGoal ? evaluateGoal(proteinGoal, nutrients.protein.value) : undefined

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="font-display text-4xl">Nutrition</h1>
          <p className="pt-1 text-sm text-ink-muted">
            {dayLabel(day, today)} · {day}
          </p>
        </div>
        <DayNav
          day={day}
          today={today}
          isToday={isToday}
          onPrevious={selected.goPrevious}
          onNext={selected.goNext}
          onToday={selected.goToday}
        />
      </header>

      <div className="grid gap-4">
        <Card label="Today's total">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Total name="Calories" value={showNumber(nutrients.energy, 'kcal')} />
            <Total
              name="Protein"
              value={
                proteinGoal
                  ? `${showNumber(nutrients.protein, 'g')} / ${showNumber(proteinGoal.target, 'g')} g`
                  : show(nutrients.protein, 'g')
              }
              good={progress?.attained}
            />
            <Total name="Carbs" value={show(nutrients.carbs, 'g')} />
            <Total name="Fat" value={show(nutrients.fat, 'g')} />
          </div>
        </Card>

        {/* Logging always writes to now, so the form only makes sense on today. */}
        {isToday && (
          <Card label="Log a meal">
            <MealForm onSubmit={addMeal} />
          </Card>
        )}

        <Card label={`Logged (${meals.length})`}>
          {meals.length === 0 && (
            <p className="py-2 text-sm text-ink-muted">
              {isToday ? 'Nothing logged yet.' : 'Nothing was logged on this day.'}
            </p>
          )}
          {meals.map((meal) => (
            <MealRow key={meal.id} meal={meal} onConfirm={confirmEstimate} />
          ))}
        </Card>
      </div>
    </div>
  )
}

function Total({ name, value, good }: { name: string; value: string; good?: boolean }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">{name}</p>
      <p className={`tabular pt-1 text-lg font-medium ${good ? 'text-leaf' : ''}`}>{value}</p>
    </div>
  )
}

function MealRow({
  meal,
  onConfirm,
}: {
  meal: Meal
  onConfirm: (meal: Meal, item: Meal['items'][number]) => Promise<void>
}) {
  const kcal = meal.items.reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0)

  return (
    <div className="border-t border-hairline py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">
          {meal.slot.charAt(0) + meal.slot.slice(1).toLowerCase()}
        </span>
        <span className="tabular text-sm">{Math.round(kcal)} kcal</span>
      </div>
      {meal.items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
          <span className="text-sm text-ink-muted">
            {item.name} · {showNumber(item.amount, 'g')} g
            <ProvenanceBadge provenance={item.provenance} />
          </span>
          <span className="flex items-baseline gap-3">
            <span className="tabular text-xs text-ink-muted">
              {showNumber(item.nutrients.protein, 'g')} g protein
            </span>
            {needsConfirmation(item.provenance) && (
              <button
                type="button"
                onClick={() => void onConfirm(meal, item)}
                className="rounded-full bg-leaf px-3 py-1 text-xs font-medium text-surface"
              >
                Confirm
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
