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
 * What is being estimated.
 *
 * A photo and a written description are two kinds of evidence for the same
 * question, so they live in one union rather than two providers: everything
 * after the answer arrives — the docked bar, the result card, Save, Retry — is
 * identical, and duplicating it would be duplicating the interesting half.
 */
export type AnalysisInput =
  | {
      kind: 'photo'
      /** Object URL for the preview. Revoked when the analysis is cleared. */
      url: string
      meta: PhotoMeta
      /** Kept in memory only, so Retry has something to retry with (spec §3). */
      blob: Blob
    }
  | { kind: 'text'; description: string }

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
  input: AnalysisInput
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
  /** The same, from a sentence the user typed. */
  startText: (
    description: string,
    hints: EstimateHints,
    slot: MealSlot,
    label: string,
  ) => Promise<void>
  retry: () => void
  /** Amends the hints and analyses the same input again. */
  restartWith: (hints: EstimateHints) => void
  clear: () => void
}

const AnalysisContext = createContext<AnalysisContextValue>({
  start: async () => {},
  startText: async () => {},
  retry: () => {},
  restartWith: () => {},
  clear: () => {},
})

export const useAnalysis = () => useContext(AnalysisContext)

/** Convenience for the screens: the photo preview, when there is one. */
export const photoUrlOf = (analysis?: Analysis): string | undefined =>
  analysis?.input.kind === 'photo' ? analysis.input.url : undefined

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
  const photoUrl = photoUrlOf(analysis)
  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    },
    [photoUrl],
  )

  const run = useCallback(
    async (base: Omit<Analysis, 'status' | 'startedAt' | 'id'>, id: number) => {
      setAnalysis({ ...base, id: String(id), status: 'running', startedAt: Date.now() })
      buzz(15)

      try {
        const estimator = getEstimator()
        const result =
          base.input.kind === 'photo'
            ? await estimator.estimate(base.input.blob, base.hints)
            : await estimator.estimateFromText(base.input.description, base.hints)
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
                  message: known
                    ? cause.message
                    : base.input.kind === 'photo'
                      ? 'Something went wrong reading the photo'
                      : 'Something went wrong reading your description',
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
          input: { kind: 'photo', url: URL.createObjectURL(blob), meta, blob },
          hints,
          model: getEstimator().model,
        },
        id,
      )
    },
    [run],
  )

  const startText = useCallback(
    async (description: string, hints: EstimateHints, slot: MealSlot, label: string) => {
      const id = ++runId.current
      await run(
        {
          slot,
          label,
          input: { kind: 'text', description: description.trim() },
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
      const url = photoUrlOf(current)
      if (url) URL.revokeObjectURL(url)
      return undefined
    })
  }, [])

  return (
    <AnalysisContext.Provider value={{ analysis, start, startText, retry, restartWith, clear }}>
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
