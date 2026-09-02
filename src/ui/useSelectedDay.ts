import { useSearchParams } from 'react-router-dom'
import { addDays, dayKey, type CalendarDate } from '@/domain'
import { deviceZone } from '@/data/newRecords'
import type { Translate } from './i18n/translate'

/**
 * The day being viewed, held in the URL (`?d=2026-08-20`).
 *
 * In the URL rather than in component state so a day survives a refresh, can
 * be linked to, and stays consistent when moving between Today and Nutrition.
 * Today itself carries no parameter, so the bare URL is always the live view.
 */
export function useSelectedDay() {
  const [params, setParams] = useSearchParams()
  const today = dayKey(new Date().toISOString(), deviceZone())
  const requested = params.get('d')
  // Never show the future: there is nothing to log there yet.
  const day = requested && requested <= today ? requested : today

  const goTo = (next: CalendarDate) => {
    if (next > today) return
    /*
      The day is changed, and everything else in the URL is left alone.

      Assigning a whole object here replaced the query string, so moving a day
      silently dropped `view=week` and dumped you back on the day view. It went
      unnoticed while the stepper only existed in the day view — there was
      nothing else in the URL to lose — and surfaced the moment the week gained
      one of its own.
    */
    const updated = new URLSearchParams(params)
    if (next === today) updated.delete('d')
    else updated.set('d', next)
    setParams(updated, { replace: true })
  }

  return {
    day,
    today,
    isToday: day === today,
    /** Jump to any day — the week stepper moves seven at a time. */
    goTo,
    goPrevious: () => goTo(addDays(day, -1)),
    goNext: () => goTo(addDays(day, 1)),
    goToday: () => goTo(today),
  }
}

/**
 * "Today", "Yesterday", or a readable date — whichever a person would say.
 *
 * Takes the translator rather than reaching for a hook, so it stays a pure
 * function that the day navigation and both screens can share.
 */
export function dayLabel(day: CalendarDate, today: CalendarDate, t?: Translate): string {
  if (day === today) return t ? t('day.today') : 'Today'
  if (day === addDays(today, -1)) return t ? t('day.yesterday') : 'Yesterday'
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(
    typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined,
    { weekday: 'long', day: 'numeric', month: 'long' },
  )
}
