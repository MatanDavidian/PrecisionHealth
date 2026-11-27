import { useEffect, useState } from 'react'
import { dayAnswers, type CalendarDate } from '@/domain'
import { getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import { useActions } from '../useHealthData'
import { useDataRevision } from '../DataProvider'
import { useLang } from '../i18n'

/**
 * "Did you log everything on Tue 24 Nov?" (meal-suggestions-precision.md §4.6)
 *
 * Under a past day's meals in Nutrition. "Yes" makes the day count in the
 * suggestion card's balance with full confidence; "No" leaves it out of that
 * balance (intake and budget both). The day itself, and the week view, show
 * what was logged either way. "Change" takes the answer back.
 */
export function DayCompleteness({ day }: { day: CalendarDate }) {
  const { t, lang } = useLang()
  const { revision } = useDataRevision()
  const { recordDayCheck } = useActions()
  const [answer, setAnswer] = useState<'COMPLETE' | 'INCOMPLETE' | null>()

  useEffect(() => {
    let cancelled = false
    void getRepositories()
      .dayChecks.listByRange(currentUserId(), { from: day, to: day })
      .then((checks) => !cancelled && setAnswer(dayAnswers(checks).get(day)?.completeness ?? null))
      .catch(() => !cancelled && setAnswer(null))
    return () => {
      cancelled = true
    }
  }, [day, revision])

  if (answer === undefined) return null
  const date = new Date(`${day}T12:00:00`).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="mt-3 rounded-xl bg-card-soft px-4 py-3 text-sm" data-testid="day-completeness">
      {answer ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-soft">
          {answer === 'COMPLETE' ? t('nutrition.dayMarkedComplete') : t('nutrition.dayMarkedIncomplete')}
          <button
            type="button"
            onClick={() => void recordDayCheck(day, { completeness: 'UNSET' })}
            className="text-xs underline underline-offset-2"
          >
            {t('nutrition.dayChange')}
          </button>
        </p>
      ) : (
        <>
          <p>{t('nutrition.dayQuestion', { date })}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void recordDayCheck(day, { completeness: 'COMPLETE' })}
              className="rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-sm"
            >
              {t('nutrition.dayComplete')}
            </button>
            <button
              type="button"
              onClick={() => void recordDayCheck(day, { completeness: 'INCOMPLETE' })}
              className="rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-sm"
            >
              {t('nutrition.dayIncomplete')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
