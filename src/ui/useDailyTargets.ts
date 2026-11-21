import { useEffect, useState } from 'react'
import { getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import { readDailyTargets, type TargetsReading } from '@/data/targets'
import type { CalendarDate } from '@/domain'
import { useDataRevision } from './DataProvider'

/**
 * The daily targets for a day (docs/features/daily-targets.md).
 *
 * Re-read when the day changes and after any write: a new weight, a goal, a
 * profile detail, or a burn typed on Today all move the numbers. Undefined
 * while reading, and also if the read fails: a target is a guide, and its
 * absence must never block the day it sits on.
 */
export function useDailyTargets(day: CalendarDate): TargetsReading | undefined {
  const { session, revision } = useDataRevision()
  const [reading, setReading] = useState<TargetsReading>()
  useEffect(() => {
    let cancelled = false
    void readDailyTargets(currentUserId(), day, getRepositories())
      .then((next) => {
        if (!cancelled) setReading(next)
      })
      .catch(() => {
        if (!cancelled) setReading(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [day, revision, session])
  return reading
}
