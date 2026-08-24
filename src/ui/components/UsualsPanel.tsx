import { useState } from 'react'
import {
  convert,
  dayKey,
  daysBetween,
  matchesQuery,
  timeOfDay,
  type IanaZone,
  type Meal,
  type MealSlot,
  type UsualFood,
  type UsualMeal,
} from '@/domain'
import { deviceZone } from '@/data/newRecords'
import type { Usuals } from '@/data/usuals'
import { Card } from './Card'

const SLOT_WORD: Record<MealSlot, string> = {
  NIGHT: 'tonight',
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'a snack',
}

const kcal = (meal: UsualMeal): number =>
  Math.round(meal.template.items.reduce((sum, i) => sum + convert(i.nutrients.energy, 'kcal'), 0))

const foodKcal = (food: UsualFood): number => Math.round(convert(food.template.nutrients.energy, 'kcal'))

const grams = (meal: UsualMeal): number =>
  Math.round(meal.template.items.reduce((sum, i) => sum + convert(i.amount, 'g'), 0))

/** "Yesterday, 07:38" · "Tuesday" · "3 weeks ago" — how a person would say it. */
function when(iso: string, zone: IanaZone): string {
  const then = new Date(iso)
  const time = then.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  // Calendar days apart, not hours apart: last night's dinner is "yesterday"
  // when you open the app after midnight, however few hours ago it was.
  const today = dayKey(new Date().toISOString(), zone)
  const days = daysBetween(dayKey(iso, zone), today)
  if (days <= 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' })
  return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`
}

/**
 * What you usually eat, offered before the camera.
 *
 * Most days are not novel. Photographing the same breakfast again costs a
 * minute of waiting and a fraction of a cent to be told what you already knew —
 * so the repeat comes first, and the camera is for food that is actually new.
 */
export function UsualsPanel({
  usuals,
  slot,
  onRepeatMeal,
  onLogFoods,
  onRepeatDay,
  busy,
}: {
  usuals: Usuals
  slot: MealSlot
  onRepeatMeal: (usual: UsualMeal) => void
  onLogFoods: (foods: UsualFood[]) => void
  onRepeatDay: (meals: Meal[]) => void
  busy: boolean
}) {
  const [selected, setSelected] = useState<UsualFood[]>([])
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')

  const zone = deviceZone()
  // Search applies only in the "everything" view — the slot list is three rows.
  const search = showAll ? query : ''
  const suggestions = (showAll ? usuals.all : usuals.forThisSlot).filter((usual) =>
    matchesQuery(
      usual.template.items.map((item) => item.name),
      search,
    ),
  )
  const foods = usuals.foods.filter((food) => matchesQuery([food.name], search))

  /**
   * Yesterday's meals whose hour has already come round today.
   *
   * The rest are left out on purpose: counting tonight's dinner at two in the
   * afternoon would add protein for food nobody has eaten.
   */
  const now = new Date()
  const dueFromYesterday = usuals.yesterdayMeals.filter((meal) => {
    const [h, m] = timeOfDay(meal, zone).split(':').map(Number)
    const then = new Date(now)
    then.setHours(h, m, 0, 0)
    return then.getTime() <= now.getTime()
  })
  const nothingYet = usuals.all.length === 0 && usuals.foods.length === 0
  if (nothingYet) return null

  const toggle = (food: UsualFood) =>
    setSelected((current) =>
      current.some((f) => f.name === food.name)
        ? current.filter((f) => f.name !== food.name)
        : [...current, food],
    )

  const selectedKcal = selected.reduce((sum, f) => sum + foodKcal(f), 0)

  return (
    <div className="pb-4">
      <Card label={showAll ? 'Everything you log' : `Usual for ${SLOT_WORD[slot]}`}>
        {suggestions.length === 0 ? (
          <p className="py-1 text-sm text-ink-muted">
            Nothing usual for {SLOT_WORD[slot]} yet — photograph one and it will be here next time.
          </p>
        ) : (
          <>
            <p className="pb-3 text-xs text-ink-muted">
              One tap logs it — no photo, no waiting, no estimate to review.
            </p>
            <div className="space-y-2">
              {suggestions.map((usual) => (
                <button
                  key={usual.signature}
                  type="button"
                  disabled={busy}
                  onClick={() => onRepeatMeal(usual)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3 text-left transition-colors hover:bg-card-soft disabled:opacity-40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {usual.template.items.map((i) => i.name).join(', ')}
                    </span>
                    <span className="block pt-0.5 text-xs text-ink-muted">
                      {when(usual.lastAt, zone)}
                      {/* Weight is worth showing only when it was recorded. */}
                      {grams(usual) > 0 && ` · ${grams(usual)} g`}
                      {usual.count > 1 && ` · logged ${usual.count}× recently`}
                      {!usual.confirmed && ' · unconfirmed estimate'}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm">{kcal(usual)} kcal</span>
                </button>
              ))}
            </div>
          </>
        )}

        {usuals.all.length > usuals.forThisSlot.length && (
          <button
            type="button"
            onClick={() => {
              setShowAll((v) => !v)
              setQuery('')
            }}
            className="pt-3 text-xs text-ink-muted underline"
          >
            {showAll ? `Back to ${SLOT_WORD[slot]}` : 'See all usuals'}
          </button>
        )}

        {showAll && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything you've logged before"
            className="mt-3 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        )}

        {dueFromYesterday.length > 0 && !showAll && (
          <div className="pt-4">
            <p className="pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Yesterday
            </p>
            <div className="space-y-1">
              {dueFromYesterday.map((meal) => (
                <div key={meal.recordId} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-ink-muted">
                    <span className="font-medium text-ink">
                      {meal.slot.charAt(0) + meal.slot.slice(1).toLowerCase()}
                    </span>{' '}
                    · {meal.items.map((i) => i.name).join(', ')}
                  </span>
                  <span className="tabular shrink-0 text-ink-muted">
                    {timeOfDay(meal, zone)}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRepeatDay(dueFromYesterday)}
              className="mt-3 rounded-full border border-hairline px-4 py-1.5 text-xs transition-colors hover:bg-card-soft disabled:opacity-40"
            >
              Repeat {dueFromYesterday.length === usuals.yesterdayMeals.length ? 'the day' : 'today so far'} ·{' '}
              {dueFromYesterday.length} meal{dueFromYesterday.length === 1 ? '' : 's'}
            </button>
            {dueFromYesterday.length < usuals.yesterdayMeals.length && (
              <p className="pt-1 text-xs text-ink-muted">
                Later meals are left out until their time comes round.
              </p>
            )}
          </div>
        )}

        {foods.length > 0 && (
          <div className="pt-4">
            <p className="pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Single foods, tap to add
            </p>
            <div className="flex flex-wrap gap-2">
              {foods.map((food) => {
                const on = selected.some((f) => f.name === food.name)
                return (
                  <button
                    key={food.name}
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(food)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                      on
                        ? 'border-accent bg-accent text-surface'
                        : 'border-hairline bg-surface hover:bg-card-soft'
                    }`}
                  >
                    {food.name} <span className="tabular opacity-70">{foodKcal(food)}</span>
                  </button>
                )
              })}
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <span className="text-xs text-ink-muted">
                  {selected.length} selected · <span className="tabular">{selectedKcal} kcal</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onLogFoods(selected)
                    setSelected([])
                  }}
                  className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-surface disabled:opacity-40"
                >
                  Log them
                </button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="rounded-full border border-hairline px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
