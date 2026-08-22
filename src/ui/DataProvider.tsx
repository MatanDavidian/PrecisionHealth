import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ensureSeeded, selectRepositoriesFor, selectEstimatorFor } from '@/data'
import { readTrialStatus, type TrialStatus } from '@/data/trial'
import { getSupabaseClient, isSupabaseConfigured } from '@/data/supabase/client'
import {
  getSession,
  isAuthAvailable,
  subscribeToSession,
  LOCAL_SESSION,
  type Session,
} from '@/data/session'

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
  /** Re-reads the trial after an analysis spends one. */
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
  const [revision, setRevision] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [session, setSession] = useState<Session>(LOCAL_SESSION)
  const [trial, setTrial] = useState<TrialStatus>()

  /**
   * Points the app at whoever is paying for analysis.
   *
   * Signed in with free analyses left, that is our server on the owner's key —
   * which is what lets a new user photograph a meal before they have ever
   * heard of an API key.
   */
  const applyEstimator = useCallback(async (current: Session) => {
    const status = current.authenticated ? await readTrialStatus(current.userId) : undefined
    setTrial(status)
    selectEstimatorFor({
      authenticated: current.authenticated,
      trialExhausted: status?.exhausted ?? false,
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
      if (!current.authenticated) await ensureSeeded()
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
  }, [applyEstimator])

  const refreshTrial = useCallback(() => {
    void applyEstimator(session)
  }, [applyEstimator, session])

  const [failure, setFailure] = useState<WriteFailure>()
  const refresh = useCallback(() => setRevision((r) => r + 1), [])
  const dismissFailure = useCallback(() => setFailure(undefined), [])

  const runWrite = useCallback(
    async (what: string, write: () => Promise<void>): Promise<boolean> => {
      try {
        await write()
        setFailure(undefined)
        setRevision((r) => r + 1)
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
        <h1 className="font-display text-2xl">Storage unavailable</h1>
        <p className="pt-2 text-sm text-ink-muted">
          This app stores your data in the browser, and the browser refused. {error}
        </p>
      </div>
    )
  }

  if (!ready) return <p className="p-8 text-sm text-ink-muted">Opening your data…</p>

  return (
    <DataContext.Provider
      value={{
        revision,
        refresh,
        session,
        authAvailable: isAuthAvailable,
        trial,
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
