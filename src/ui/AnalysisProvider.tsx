import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getEstimator } from '@/data'
import { describePhoto, downscale } from '@/ai/photo'
import { EstimateError, type EstimateHints, type EstimateResult, type PhotoMeta } from '@/ai/estimator'
import { TrialExhaustedError } from '@/ai/proxyEstimator'
import type { MealSlot } from '@/domain'

/**
 * An analysis in flight.
 *
 * It lives here rather than in the Log screen because it outlives the screen:
 * a photo takes up to a minute to read, and people put the phone down, check
 * something else, or switch tabs. Owned by the screen, the work would be
 * cancelled by a navigation and the user would come back to nothing — which is
 * exactly the "I took a photo and nothing happened" report this fixes.
 */
export interface Analysis {
  id: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  finishedAt?: number
  slot: MealSlot
  /** What to call it in the docked bar: "lunch", "breakfast". */
  label: string
  photoUrl: string
  photoMeta: PhotoMeta
  photoBlob: Blob
  hints: EstimateHints
  result?: EstimateResult
  downgraded?: boolean
  error?: { message: string; retryable: boolean; exhausted: boolean }
  model: string
}

interface AnalysisContextValue {
  analysis?: Analysis
  /** Downscales, starts the estimate, and returns as soon as it is under way. */
  start: (file: Blob, hints: EstimateHints, slot: MealSlot, label: string) => Promise<void>
  retry: () => void
  /** Amends the hints and analyses the same photo again. */
  restartWith: (hints: EstimateHints) => void
  clear: () => void
}

const AnalysisContext = createContext<AnalysisContextValue>({
  start: async () => {},
  retry: () => {},
  restartWith: () => {},
  clear: () => {},
})

export const useAnalysis = () => useContext(AnalysisContext)

/**
 * A short buzz on start and finish.
 *
 * The phone is already in the hand; a tap says "heard you" and "done" without
 * asking anyone to look at the screen. Silently unavailable on iOS Safari,
 * which does not implement the Vibration API — hence the feature test rather
 * than a promise the platform will not keep.
 */
const buzz = (pattern: number | number[]): void => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    // Some browsers throw when the page is not visible. Nothing to do.
  }
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [analysis, setAnalysis] = useState<Analysis>()
  /** Only the newest run may write results; an abandoned retry must not. */
  const runId = useRef(0)

  // Object URLs outlive the component that made them unless revoked.
  useEffect(
    () => () => {
      if (analysis?.photoUrl) URL.revokeObjectURL(analysis.photoUrl)
    },
    [analysis?.photoUrl],
  )

  const run = useCallback(
    async (base: Omit<Analysis, 'status' | 'startedAt' | 'id'>, id: number) => {
      setAnalysis({ ...base, id: String(id), status: 'running', startedAt: Date.now() })
      buzz(15)

      try {
        const estimator = getEstimator()
        const result = await estimator.estimate(base.photoBlob, base.hints)
        if (runId.current !== id) return
        buzz([15, 60, 15])
        setAnalysis((current) =>
          current && current.id === String(id)
            ? {
                ...current,
                status: 'done',
                finishedAt: Date.now(),
                result,
                model: estimator.model,
                downgraded: 'downgraded' in estimator ? Boolean(estimator.downgraded) : false,
              }
            : current,
        )
      } catch (cause) {
        if (runId.current !== id) return
        const known = cause instanceof EstimateError
        const exhausted = cause instanceof TrialExhaustedError
        buzz(15)
        setAnalysis((current) =>
          current && current.id === String(id)
            ? {
                ...current,
                status: 'failed',
                finishedAt: Date.now(),
                error: {
                  message: known ? cause.message : 'Something went wrong reading the photo',
                  retryable: !known || cause.kind !== 'NO_KEY',
                  exhausted,
                },
              }
            : current,
        )
      }
    },
    [],
  )

  const start = useCallback(
    async (file: Blob, hints: EstimateHints, slot: MealSlot, label: string) => {
      const blob = await downscale(file)
      const meta = await describePhoto(blob)
      const id = ++runId.current
      await run(
        {
          slot,
          label,
          photoUrl: URL.createObjectURL(blob),
          photoMeta: meta,
          photoBlob: blob,
          hints,
          model: getEstimator().model,
        },
        id,
      )
    },
    [run],
  )

  const restartWith = useCallback(
    (hints: EstimateHints) => {
      setAnalysis((current) => {
        if (!current) return current
        const id = ++runId.current
        void run({ ...current, hints, result: undefined, error: undefined }, id)
        return current
      })
    },
    [run],
  )

  const retry = useCallback(() => {
    setAnalysis((current) => {
      if (!current) return current
      const id = ++runId.current
      void run({ ...current, result: undefined, error: undefined }, id)
      return current
    })
  }, [run])

  const clear = useCallback(() => {
    runId.current += 1
    setAnalysis((current) => {
      if (current?.photoUrl) URL.revokeObjectURL(current.photoUrl)
      return undefined
    })
  }, [])

  return (
    <AnalysisContext.Provider value={{ analysis, start, retry, restartWith, clear }}>
      {children}
    </AnalysisContext.Provider>
  )
}

/** Ticks once a second while something is running, for the elapsed display. */
export function useElapsed(since?: number, running?: boolean): number {
  const [, force] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [running])
  return since ? Math.floor((Date.now() - since) / 1000) : 0
}

export const formatElapsed = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
