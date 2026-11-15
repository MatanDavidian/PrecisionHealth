import { useEffect, useState } from 'react'
import { getRepositories } from '@/data'
import { currentUserId } from '@/data/session'
import { addDays } from '@/domain'
import { useDataRevision } from '../DataProvider'
import { useT } from '../i18n'
import { hasSeenNotice, OneTimeNotice } from './OneTimeNotice'

/** How far back "nothing logged" looks: a new account, or one long left alone. */
const QUIET_DAYS = 30

/**
 * The first minute, said once (docs/PHASE-1-FINISH.md, onboarding).
 *
 * A stranger used to land on a sample day with no explanation, and a new
 * account on a page of dashes. Two notices, each shown until dismissed on
 * this device, and neither one a modal: nothing here is worth blocking the
 * app for, and a person who wants to look around first can simply look.
 *
 * - Signed out: what this is, where what they log is kept, and the way to
 *   the free analyses.
 * - Signed in with nothing logged in a month: the one thing to do next.
 *   Connecting a Garmin is not offered yet: the watch app is not in Garmin's
 *   store, so a stranger could not finish that step.
 */
export function Welcome({ today }: { today: string }) {
  const t = useT()
  const { session, revision } = useDataRevision()
  const [quiet, setQuiet] = useState(false)

  useEffect(() => {
    if (!session.authenticated || hasSeenNotice('first-steps')) return
    let cancelled = false
    void getRepositories()
      .meals.listByRange(currentUserId(), { from: addDays(today, -QUIET_DAYS), to: today })
      .then((meals) => {
        if (!cancelled) setQuiet(meals.length === 0)
      })
      // Unreadable is said elsewhere on the page; this stays out of the way.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session.authenticated, today, revision])

  if (!session.authenticated) {
    return (
      <OneTimeNotice id="welcome" title={t('welcome.title')} actionLabel={t('welcome.signIn')} actionTo="/signin">
        <p>{t('welcome.what')}</p>
        <p className="pt-1.5">{t('welcome.data')}</p>
      </OneTimeNotice>
    )
  }
  if (!quiet) return null
  return (
    <OneTimeNotice id="first-steps" title={t('firstSteps.title')} actionLabel={t('firstSteps.log')} actionTo="/log">
      <p>{t('firstSteps.meal')}</p>
      <p className="pt-1.5">{t('firstSteps.byHand')}</p>
    </OneTimeNotice>
  )
}
