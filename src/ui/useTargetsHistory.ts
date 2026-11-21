import { useEffect, useState } from 'react'
import { getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import { readTargetsHistory, type DayAgainstTargets } from '@/data/targets'
import type { CalendarDate } from '@/domain'
import { useDataRevision } from './DataProvider'

/**
 * A stretch of days, each against its own targets: the week's marks and the
 * streak (docs/features/daily-targets.md). Read only while `enabled`, so a
 * screen that is not showing them does not pay for them; re-read after any
 * write, like the day itself.
 */
export function useTargetsHistory(
  from: CalendarDate,
  to: CalendarDate,
  enabled: boolean,
): DayAgainstTargets[] | undefined {
  const { session, revision } = useDataRevision()
  const [days, setDays] = useState<DayAgainstTargets[]>()
  useEffect(() => {
    if (!enabled || to < from) {
      setDays(undefined)
      return
    }
    let cancelled = false
    void readTargetsHistory(currentUserId(), from, to, getRepositories())
      .then((next) => {
        if (!cancelled) setDays(next)
      })
      .catch(() => {
        if (!cancelled) setDays(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [from, to, enabled, revision, session])
  return days
}
