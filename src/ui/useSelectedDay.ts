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
    setParams(next === today ? {} : { d: next }, { replace: true })
  }

  return {
    day,
    today,
    isToday: day === today,
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
