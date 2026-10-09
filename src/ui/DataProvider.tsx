import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ensureSeeded, selectRepositoriesFor, selectEstimatorFor } from '@/data'
import { readTrialStatus, type TrialStatus } from '@/data/trial'
import { readPlanStatus, type PlanStatus } from '@/data/plan'
import { askToKeepOnce } from '@/data/persistence'
import { getSupabaseClient, isSupabaseConfigured } from '@/data/supabase/client'
import {
  getSession,
  isAuthAvailable,
  subscribeToSession,
  LOCAL_SESSION,
  type Session,
} from '@/data/session'
import { useT } from './i18n'

/** A write that failed, kept with the means to try it again. */
export interface WriteFailure {
  what: string
  message: string
  retry: () => void
}

interface DataContextValue {
  /** Bumped after every write; reads depend on it and re-run. */
  revision: number
  refresh: () => void
  /** Who is signed in, or the local stand-in when nobody is. */
  session: Session
  /** False in builds with no Supabase project configured. */
  authAvailable: boolean
  /** Free analyses left on the owner's key; undefined when not applicable. */
  trial?: TrialStatus
  /** The paid plan, while a subscription gives access; undefined otherwise. */
  plan?: PlanStatus
  /** Re-reads the trial and the plan after an analysis spends one. */
  refreshTrial: () => void
  /**
   * Runs a write, refreshes reads on success, and surfaces the failure with a
   * retry on error.
   *
   * Every write goes through here rather than each caller doing its own
   * try/catch: writes are about to cross a network (slice 3), and "it silently
   * did nothing" is the worst possible outcome for a health log.
   */
  runWrite: (what: string, write: () => Promise<void>) => Promise<boolean>
  failure?: WriteFailure
  dismissFailure: () => void
}

const DataContext = createContext<DataContextValue>({
  revision: 0,
  refresh: () => {},
  session: LOCAL_SESSION,
  authAvailable: false,
  refreshTrial: () => {},
  runWrite: async () => false,
  dismissFailure: () => {},
})

export const useDataRevision = () => useContext(DataContext)

/**
 * Gates the app until first-run seeding has finished, so no screen can read an
 * empty store and render "no data" for a split second before the sample day
 * appears.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [revision, setRevision] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [session, setSession] = useState<Session>(LOCAL_SESSION)
  const [trial, setTrial] = useState<TrialStatus>()
  const [plan, setPlan] = useState<PlanStatus>()

  /**
   * Points the app at whoever is paying for analysis.
   *
   * Signed in with free analyses left, that is our server on the owner's key —
   * which is what lets a new user photograph a meal before they have ever
   * heard of an API key — and, for a subscriber, the same server on the plan.
   */
  const applyEstimator = useCallback(async (current: Session) => {
    const [status, paid] = current.authenticated
      ? await Promise.all([readTrialStatus(current.userId), readPlanStatus(current.userId)])
      : [undefined, undefined]
    setTrial(status)
    setPlan(paid)
    selectEstimatorFor({
      authenticated: current.authenticated,
      // A subscriber is never sent to their own key: the server answers for the
      // plan, and says so when a month's allowance is spent.
      trialExhausted: (status?.exhausted ?? false) && !paid,
      suggestedModel: status?.suggestedModel,
      getAccessToken: async () => {
        if (!isSupabaseConfigured) return undefined
        const client = await getSupabaseClient()
        const { data } = await client.auth.getSession()
        return data.session?.access_token
      },
    })
  }, [])

  useEffect(() => {
    /**
     * Nothing renders until the session is known AND the store has been chosen
     * for it. Rendering earlier would briefly show the local user's data to
     * someone who is actually signed in — reading one account and then
     * silently becoming another.
     */
    async function start() {
      const current = await getSession()
      setSession(current)
      await selectRepositoriesFor(current)
      await applyEstimator(current)
      // Only the signed-out, local store carries sample data.
      /*
        The sample day is written in whatever language is active at first run,
        and stays that way. That is the honest behaviour: once written it is a
        record like any other, exactly as a meal logged in English stays
        English when you later switch.
      */
      if (!current.authenticated) {
        await ensureSeeded({
          eggsAndOats: t('seed.eggsAndOats'),
          grilledChicken: t('seed.grilledChicken'),
          riceAndVegetables: t('seed.riceAndVegetables'),
          salmonPotatoesSalad: t('seed.salmonPotatoesSalad'),
          benchPress: t('seed.benchPress'),
          barbellRow: t('seed.barbellRow'),
        })
      }
      setReady(true)
    }

    start().catch((cause: unknown) => {
      // Private browsing and some iOS configurations block IndexedDB outright.
      setError(cause instanceof Error ? cause.message : 'Storage is unavailable')
    })

    // Signing in or out swaps the store underneath every screen.
    return subscribeToSession((next) => {
      void Promise.all([selectRepositoriesFor(next), applyEstimator(next)]).then(() => {
        // Only announce the new session once its store is in place, so no
        // screen can read the previous adapter as the new user.
        setSession(next)
        setRevision((r) => r + 1)
      })
    })
  }, [applyEstimator, t])

  const refreshTrial = useCallback(() => {
    void applyEstimator(session)
  }, [applyEstimator, session])

  const [failure, setFailure] = useState<WriteFailure>()
  const refresh = useCallback(() => setRevision((r) => r + 1), [])
  const signedIn = useRef(session.authenticated)
  signedIn.current = session.authenticated
  const dismissFailure = useCallback(() => setFailure(undefined), [])

  const runWrite = useCallback(
    async (what: string, write: () => Promise<void>): Promise<boolean> => {
      try {
        await write()
        setFailure(undefined)
        setRevision((r) => r + 1)
        // Signed out, this browser is the only copy: ask it not to clear it.
        if (!signedIn.current) void askToKeepOnce()
        return true
      } catch (cause) {
        setFailure({
          what,
          message: cause instanceof Error ? cause.message : 'Unknown error',
          // Retrying re-enters this same path, so a second failure re-reports.
          retry: () => void runWrite(what, write),
        })
        return false
      }
    },
    [],
  )

  if (error) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl">{t('app.storageUnavailable')}</h1>
        <p className="pt-2 text-sm text-ink-muted">
          {t('app.storageUnavailableBody', { error })}
        </p>
      </div>
    )
  }

  if (!ready) return <p className="p-8 text-sm text-ink-muted">{t('app.opening')}</p>

  return (
    <DataContext.Provider
      value={{
        revision,
        refresh,
        session,
        authAvailable: isAuthAvailable,
        trial,
        plan,
        refreshTrial,
        runWrite,
        failure,
        dismissFailure,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}
