import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ensureSeeded } from '@/data'

interface DataContextValue {
  /** Bumped after every write; reads depend on it and re-run. */
  revision: number
  refresh: () => void
}

const DataContext = createContext<DataContextValue>({ revision: 0, refresh: () => {} })

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

  const refresh = useCallback(() => setRevision((r) => r + 1), [])

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

  return <DataContext.Provider value={{ revision, refresh }}>{children}</DataContext.Provider>
}
