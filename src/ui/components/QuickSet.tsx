import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import {
  addDays,
  dayKeyOf,
  FILL_LOOKBACK_DAYS,
  isPatternFilled,
  latestVersions,
  quickSetIntake,
  typicalIntake,
  type CalendarDate,
  type DayIntake,
  type QuickSetChoice,
} from '@/domain'
import { useDataRevision } from '../DataProvider'
import { useLang } from '../i18n'

/**
 * Quick-set (docs/features/quick-set-a-day.md): a day nobody logged, set in
 * one tap to less than usual, the usual, more than usual, or a number.
 *
 * Three places use it: the week's gaps card, the Day tab (a past empty day,
 * or today from 16:00), and the Nutrition tab. One chooser, so the four
 * choices mean the same thing everywhere.
 */

export interface QuickSetValue {
  choice: QuickSetChoice
  /** The number typed, used when the choice is NUMBER. */
  kcal: number
}

/** What a choice comes to, or undefined when it cannot be honoured (a blank number). */
export const intakeFor = (value: QuickSetValue, typical: DayIntake | undefined): DayIntake | undefined =>
  quickSetIntake(typical ? value.choice : 'NUMBER', typical, value.kcal)

/** Where a day starts: the average when there is one, and a round number to edit when there is not. */
export const initialQuickSet = (typical: DayIntake | undefined): QuickSetValue => ({
  choice: typical ? 'AVERAGE' : 'NUMBER',
  kcal: typical ? Math.round(typical.energyKcal / 100) * 100 : 1800,
})

/** Calories as the reader writes them: 1,920 in English, the same digits in Hebrew. */
export const useKcal = () => {
  const { lang } = useLang()
  return (kcal: number) => Math.round(kcal).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')
}

/**
 * The average a day would be set from, and how many logged days stand behind it.
 *
 * Drawn the way the week's gaps card always drew it: the most recent logged
 * days before this one, filled days excluded (rule 1 of patternFill.ts).
 */
export function useQuickSetBasis(day: CalendarDate, enabled: boolean) {
  const { revision } = useDataRevision()
  const [basis, setBasis] = useState<{ typical?: ReturnType<typeof typicalIntake>; loggedDays: number }>()
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void getRepositories()
      .meals.listByRange(currentUserId(), { from: addDays(day, -FILL_LOOKBACK_DAYS), to: day })
      .then((history) => {
        if (cancelled) return
        const meals = latestVersions(history)
        const loggedDays = new Set(
          meals.filter((meal) => !meal.retracted && !isPatternFilled(meal)).map((meal) => dayKeyOf(meal.time)).filter((d) => d < day),
        ).size
        setBasis({ typical: typicalIntake(meals, { source: 'RECENT', forDay: day }), loggedDays })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [day, enabled, revision])
  return basis
}

/**
 * The four choices, or the number alone when there is no average to scale.
 *
 * Buttons that say what they come to ("−15% · 1,632 kcal"), so nobody has to
 * work out what "less" means. Average is first in the reading order after
 * less only because less, average, more is the order people say it in.
 */
export function QuickSetChooser({
  typical,
  value,
  onChange,
  legend,
  numberLabel,
  loggedDays,
}: {
  typical?: DayIntake
  value: QuickSetValue
  onChange: (next: QuickSetValue) => void
  legend: string
  numberLabel: string
  /** Shown when there is no average yet: how far from one the person is. */
  loggedDays?: number
}) {
  const { t } = useLang()
  const kcal = useKcal()
  const fieldId = useId()
  const choice = typical ? value.choice : 'NUMBER'
  const intake = intakeFor(value, typical)

  const options: { id: QuickSetChoice; label: string; detail: string }[] = typical
    ? [
        { id: 'LESS', label: t('quickSet.less'), detail: t('quickSet.lessDetail', { kcal: kcal(quickSetIntake('LESS', typical)!.energyKcal) }) },
        { id: 'AVERAGE', label: t('quickSet.average'), detail: t('quickSet.averageDetail', { kcal: kcal(typical.energyKcal) }) },
        { id: 'MORE', label: t('quickSet.more'), detail: t('quickSet.moreDetail', { kcal: kcal(quickSetIntake('MORE', typical)!.energyKcal) }) },
        { id: 'NUMBER', label: t('quickSet.number'), detail: t('quickSet.numberDetail') },
      ]
    : []

  const step = (by: number) => onChange({ choice: 'NUMBER', kcal: Math.max(0, Math.round(value.kcal) + by) })

  return (
    // min-w-0: a fieldset is as wide as its widest content by default, and a
    // number input's natural width would push it past a phone's card.
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="pb-2 text-sm font-medium">{legend}</legend>
      {options.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {options.map((option) => {
            const on = option.id === choice
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, choice: option.id })}
                className={`min-h-[3.75rem] rounded-2xl border px-3 py-2 text-start transition-colors ${
                  on ? 'border-ink bg-ink text-canvas' : 'border-hairline bg-surface hover:bg-card-soft'
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="tabular block pt-0.5 text-xs">{option.detail}</span>
              </button>
            )
          })}
        </div>
      )}

      {choice === 'NUMBER' && (
        <div className={`rounded-2xl border border-hairline bg-surface p-3.5 ${options.length ? 'mt-2' : ''}`}>
          <label htmlFor={fieldId} className="block pb-2 text-xs text-ink-soft">
            {numberLabel}
          </label>
          <div className="flex items-center gap-2" dir="ltr">
            <button
              type="button"
              aria-label={t('quickSet.less100')}
              onClick={() => step(-100)}
              className="size-11 shrink-0 rounded-full border border-hairline bg-canvas text-xl"
            >
              −
            </button>
            <input
              id={fieldId}
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={Number.isFinite(value.kcal) ? value.kcal : ''}
              onChange={(e) => onChange({ choice: 'NUMBER', kcal: Number(e.target.value) })}
              className="tabular h-12 min-w-0 flex-1 rounded-xl border border-hairline bg-canvas px-3 text-center text-xl font-semibold outline-none focus:border-accent"
            />
            <button
              type="button"
              aria-label={t('quickSet.more100')}
              onClick={() => step(100)}
              className="size-11 shrink-0 rounded-full border border-hairline bg-canvas text-xl"
            >
              +
            </button>
          </div>
          <p className="pt-2 text-xs leading-relaxed text-ink-muted">
            {typical && intake
              ? t('quickSet.mix', { protein: Math.round(intake.proteinG), carbs: Math.round(intake.carbsG), fat: Math.round(intake.fatG) })
              : t('quickSet.caloriesOnly')}
          </p>
        </div>
      )}

      {!typical && loggedDays !== undefined && (
        <p className="pt-2 text-xs leading-relaxed text-ink-muted">{t('quickSet.needHistory', { count: loggedDays })}</p>
      )}
    </fieldset>
  )
}

/**
 * A day with nothing on it, offered the quick-set: on Today (a past day, or
 * today from 16:00) and in the Nutrition tab.
 *
 * In the Nutrition tab adding the meals stays the first button, because that
 * is what the tab is for; elsewhere setting the day is, with logging offered
 * under it as the better answer when it is possible.
 */
export function SetDayCard({
  day,
  isToday,
  place,
  onSet,
  onAddMeal,
  addMealLabel,
}: {
  day: CalendarDate
  isToday: boolean
  place: 'today' | 'nutrition'
  onSet: (intake: DayIntake, choice: QuickSetChoice) => Promise<void>
  onAddMeal?: () => void
  /** The add button's words: the day named, so it differs from the meal list's own "Add meal". */
  addMealLabel?: string
}) {
  const { t } = useLang()
  const kcal = useKcal()
  const basis = useQuickSetBasis(day, true)
  const [value, setValue] = useState<QuickSetValue>()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (basis) setValue(initialQuickSet(basis.typical))
  }, [basis])
  if (!basis || !value) return null

  const intake = intakeFor(value, basis.typical)
  const setLabel = intake
    ? t(isToday ? 'quickSet.setToday' : 'quickSet.setDay', { kcal: kcal(intake.energyKcal) })
    : t('quickSet.enterNumber')
  const set = async () => {
    if (!intake) return
    setBusy(true)
    try {
      await onSet(intake, basis.typical ? value.choice : 'NUMBER')
    } finally {
      setBusy(false)
    }
  }

  const nutrition = place === 'nutrition'
  const title = nutrition ? t('quickSet.nutritionTitle') : isToday ? t('quickSet.todayTitle') : t('quickSet.pastTitle')
  const body = nutrition ? t('quickSet.nutritionBody') : isToday ? t('quickSet.todayBody') : t('quickSet.pastBody')

  const chooser = (
    <QuickSetChooser
      typical={basis.typical}
      value={value}
      onChange={setValue}
      legend={isToday ? t('quickSet.legendToday') : t('quickSet.legendOne')}
      numberLabel={t('quickSet.kcalLabelOne')}
      loggedDays={basis.loggedDays}
    />
  )
  const setButton = (primary: boolean) => (
    <button
      type="button"
      onClick={() => void set()}
      disabled={!intake || busy}
      className={
        primary
          ? 'w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-surface disabled:opacity-40'
          : 'w-full rounded-full border border-ink px-5 py-3 text-sm font-medium disabled:opacity-40'
      }
    >
      {busy ? t('gaps.filling') : setLabel}
    </button>
  )

  return (
    <section aria-labelledby={`set-day-${day}`} className="rounded-card border border-dashed border-hairline p-5">
      <h2 id={`set-day-${day}`} className="font-display text-xl leading-snug">
        {title}
      </h2>
      <p className="max-w-[52ch] pt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>

      {nutrition && onAddMeal ? (
        <>
          <button
            type="button"
            onClick={onAddMeal}
            className="mt-4 w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-surface"
          >
            {addMealLabel ?? t('nutrition.addMeal')}
          </button>
          <p className="flex items-center gap-3 py-3 text-xs text-ink-muted" aria-hidden>
            <span className="h-px flex-1 bg-hairline" />
            {t('quickSet.orSet')}
            <span className="h-px flex-1 bg-hairline" />
          </p>
          {chooser}
          <div className="pt-3">{setButton(false)}</div>
        </>
      ) : (
        <>
          <div className="pt-4">{chooser}</div>
          <div className="pt-3">{setButton(true)}</div>
          <Link to="/log" className="block py-3 text-center text-sm text-ink-soft underline">
            {t('quickSet.logInstead')}
          </Link>
        </>
      )}
      <p className="text-xs leading-relaxed text-ink-muted">{t('quickSet.note')}</p>
    </section>
  )
}
