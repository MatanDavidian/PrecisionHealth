import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ensureSeeded } from '@/data'

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

  useEffect(() => {
    ensureSeeded()
      .then(() => setReady(true))
      .catch((cause: unknown) => {
        // Private browsing and some iOS configurations block IndexedDB outright.
        setError(cause instanceof Error ? cause.message : 'Storage is unavailable')
      })
  }, [])

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
    <DataContext.Provider value={{ revision, refresh, runWrite, failure, dismissFailure }}>
      {children}
    </DataContext.Provider>
  )
}
