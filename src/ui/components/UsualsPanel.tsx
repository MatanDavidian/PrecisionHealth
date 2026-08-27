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
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

const slotWordKey = (slot: MealSlot): StringKey => `common.slotWord.${slot}` as StringKey

const kcal = (meal: UsualMeal): number =>
  Math.round(meal.template.items.reduce((sum, i) => sum + convert(i.nutrients.energy, 'kcal'), 0))

const foodKcal = (food: UsualFood): number => Math.round(convert(food.template.nutrients.energy, 'kcal'))

const grams = (meal: UsualMeal): number =>
  Math.round(meal.template.items.reduce((sum, i) => sum + convert(i.amount, 'g'), 0))

/** "Yesterday, 07:38" · "Tuesday" · "3 weeks ago" — how a person would say it. */
function when(iso: string, zone: IanaZone, t: ReturnType<typeof useT>, locale: string): string {
  const then = new Date(iso)
  const time = then.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  // Calendar days apart, not hours apart: last night's dinner is "yesterday"
  // when you open the app after midnight, however few hours ago it was.
  const today = dayKey(new Date().toISOString(), zone)
  const days = daysBetween(dayKey(iso, zone), today)
  if (days <= 0) return t('when.today', { time })
  if (days === 1) return t('when.yesterday', { time })
  if (days < 7) return then.toLocaleDateString(locale, { weekday: 'long' })
  return t('when.weeksAgo', { count: Math.floor(days / 7) })
}

/**
 * What you usually eat.
 *
 * Most days are not novel. Photographing the same breakfast again costs a
 * minute of waiting and a fraction of a cent to be told what you already knew —
 * so this is a way in of its own, and the camera is for food that is new.
 *
 * `searchFirst` is what the Again tab passes: the box is at the top and typing
 * in it searches everything ever logged, not just this hour's three rows. Off,
 * the panel is the compact form the Photo tab shows beside the camera.
 */
export function UsualsPanel({
  usuals,
  slot,
  onRepeatMeal,
  onLogFoods,
  onRepeatDay,
  busy,
  searchFirst = false,
}: {
  usuals: Usuals
  slot: MealSlot
  onRepeatMeal: (usual: UsualMeal) => void
  onLogFoods: (foods: UsualFood[]) => void
  onRepeatDay: (meals: Meal[]) => void
  busy: boolean
  searchFirst?: boolean
}) {
  const t = useT()
  const locale = document.documentElement.lang || 'en'
  const slotWord = t(slotWordKey(slot))
  const [selected, setSelected] = useState<UsualFood[]>([])
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')

  const zone = deviceZone()
  const searching = query.trim().length > 0
  // A query means the slot filter is in the way: someone searching "porridge"
  // at seven in the evening wants the porridge, not to be told there is none
  // for dinner.
  const everything = showAll || (searchFirst && searching)
  const search = everything ? query : ''
  const suggestions = (everything ? usuals.all : usuals.forThisSlot).filter((usual) =>
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
      {searchFirst && (
        <label className="mb-4 flex items-center gap-3 rounded-full border border-hairline bg-surface px-4 py-2.5">
          <SearchIcon />
          <span className="sr-only">{t('usuals.search')}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('usuals.search')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
        </label>
      )}

      <Card label={everything ? t('usuals.everything') : t('usuals.forSlot', { slot: slotWord })}>
        {suggestions.length === 0 ? (
          <p className="py-1 text-sm text-ink-muted">
            {searching
              ? t('usuals.noMatch', { query: query.trim() })
              : t('usuals.none', { slot: slotWord })}
          </p>
        ) : (
          <>
            <p className="pb-3 text-xs text-ink-muted">{t('usuals.oneTap')}</p>
            <div className="space-y-2">
              {suggestions.map((usual) => (
                <button
                  key={usual.signature}
                  type="button"
                  disabled={busy}
                  onClick={() => onRepeatMeal(usual)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3 text-start transition-colors hover:bg-card-soft disabled:opacity-40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {usual.template.items.map((i) => i.name).join(', ')}
                    </span>
                    <span className="block pt-0.5 text-xs text-ink-muted">
                      {when(usual.lastAt, zone, t, locale)}
                      {/* Weight is worth showing only when it was recorded. */}
                      {grams(usual) > 0 && ` · ${grams(usual)} g`}
                      {usual.count > 1 && ` · ${t('usuals.loggedTimes', { count: usual.count })}`}
                      {!usual.confirmed && ` · ${t('usuals.unconfirmed')}`}
                    </span>
                  </span>
                  <span className="tabular ltr-nums shrink-0 text-sm">{kcal(usual)} kcal</span>
                </button>
              ))}
            </div>
          </>
        )}

        {usuals.all.length > usuals.forThisSlot.length && !searching && (
          <button
            type="button"
            onClick={() => {
              setShowAll((v) => !v)
              setQuery('')
            }}
            className="pt-3 text-xs text-ink-muted underline"
          >
            {showAll ? t('usuals.backTo', { slot: slotWord }) : t('usuals.seeAll')}
          </button>
        )}

        {showAll && !searchFirst && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('usuals.search')}
            className="mt-3 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        )}

        {dueFromYesterday.length > 0 && !everything && (
          <div className="pt-4">
            <p className="pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {t('usuals.yesterday')}
            </p>
            <div className="space-y-1">
              {dueFromYesterday.map((meal) => (
                <div key={meal.recordId} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-ink-muted">
                    <span className="font-medium text-ink">
                      {t(`common.slot.${meal.slot}` as StringKey)}
                    </span>{' '}
                    · {meal.items.map((i) => i.name).join(', ')}
                  </span>
                  <span className="tabular ltr-nums shrink-0 text-ink-muted">
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
              {dueFromYesterday.length === usuals.yesterdayMeals.length
                ? t('usuals.repeatDay')
                : t('usuals.repeatSoFar')}{' '}
              · {t('usuals.mealCount', { count: dueFromYesterday.length })}
            </button>
            {dueFromYesterday.length < usuals.yesterdayMeals.length && (
              <p className="pt-1 text-xs text-ink-muted">{t('usuals.laterLeftOut')}</p>
            )}
          </div>
        )}

        {foods.length > 0 && (
          <div className="pt-4">
            <p className="pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {t('usuals.singleFoods')}
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
                    {food.name}{' '}
                    <span className="tabular ltr-nums opacity-70">{foodKcal(food)}</span>
                  </button>
                )
              })}
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <span className="text-xs text-ink-muted">
                  {t('usuals.selected', { count: selected.length })} ·{' '}
                  <span className="tabular ltr-nums">{selectedKcal} kcal</span>
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
                  {t('usuals.logThem')}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="rounded-full border border-hairline px-3 py-1.5 text-xs"
                >
                  {t('usuals.cancel')}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className="shrink-0 text-ink-muted"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}
