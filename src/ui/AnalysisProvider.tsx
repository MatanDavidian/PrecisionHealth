import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getEstimator, setConversationId } from '@/data'
import { describePhoto, downscale } from '@/ai/photo'
import {
  EstimateError,
  type EstimateHints,
  type EstimateResult,
  type FollowUp,
  type PhotoMeta,
} from '@/ai/estimator'
import { MAX_FOLLOW_UPS } from '../../supabase/functions/_shared/prompt'
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
  /**
   * Which meal this is, across every round of questions about it.
   *
   * The server charges a conversation once and counts follow-ups against this
   * id, so it has to survive answering rather than being minted per call.
   */
  conversationId: string
  /** The questions the model asked and what the user said back, oldest first. */
  answers: FollowUp[]
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
  /** Sends the user's reply to the model's question and re-estimates. */
  answerQuestion: (answer: string) => void
  clear: () => void
}

const AnalysisContext = createContext<AnalysisContextValue>({
  start: async () => {},
  startText: async () => {},
  retry: () => {},
  restartWith: () => {},
  answerQuestion: () => {},
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
/** Identifies one meal across every round of questions about it. */
const newConversationId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`

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
  /**
   * The current analysis, readable from a callback without re-creating it.
   *
   * Retry, restart and answering all need to know what is on screen in order
   * to run it again. Reading that inside a `setAnalysis` updater and starting
   * a new run from there looks tempting and is wrong: an updater must be pure,
   * React may call it twice under StrictMode, and a `setState` made from
   * inside one is not reliably applied — which is exactly why answering a
   * question appeared to do nothing at all.
   */
  const latest = useRef<Analysis>()
  latest.current = analysis

  // Object URLs outlive the component that made them unless revoked.
  const photoUrl = photoUrlOf(analysis)
  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    },
    [photoUrl],
  )

  /**
   * Puts the running state on screen. The only thing that may happen before
   * this call is choosing the file — no decode, no downscale, no hash — so
   * the screen changes the instant the camera hands back a photo. Gating the
   * first paint on that work is what "I took a photo and nothing happened"
   * turned out to be: canvas decode/encode can stall for a beat right after
   * the native camera UI closes, and a phone left showing the idle screen
   * during that stall looks broken rather than busy.
   */
  const beginRun = useCallback((base: Omit<Analysis, 'status' | 'startedAt' | 'id'>, id: number) => {
    // Told before the call, so the proxy bills this round to the right meal.
    setConversationId(base.conversationId)
    setAnalysis({ ...base, id: String(id), status: 'running', startedAt: Date.now() })
    buzz(15)
  }, [])

  /** Calls the estimator and writes the result or error. The running state must already be showing. */
  const finish = useCallback(async (
    input: AnalysisInput,
    hints: EstimateHints,
    id: number,
    answers: FollowUp[] = [],
  ) => {
    try {
      const estimator = getEstimator()
      const result =
        input.kind === 'photo'
          ? await estimator.estimate(input.blob, hints, answers)
          : await estimator.estimateFromText(input.description, hints, answers)
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
                  : input.kind === 'photo'
                    ? 'Something went wrong reading the photo'
                    : 'Something went wrong reading your description',
                retryable: !known || cause.kind !== 'NO_KEY',
                exhausted,
              },
            }
          : current,
      )
    }
  }, [])

  const start = useCallback(
    async (file: Blob, hints: EstimateHints, slot: MealSlot, label: string) => {
      const id = ++runId.current
      // The photo as captured, before any processing — this is what the
      // running state shows until the downscale below replaces it.
      const capturedUrl = URL.createObjectURL(file)
      beginRun(
        {
          slot,
          label,
          input: { kind: 'photo', url: capturedUrl, meta: { width: 0, height: 0, bytes: file.size, sha256: '' }, blob: file },
          hints,
          model: getEstimator().model,
          conversationId: newConversationId(),
          answers: [],
        },
        id,
      )

      const blob = await downscale(file)
      const meta = await describePhoto(blob)
      if (runId.current !== id) return
      // Swapping `input.url` here retires `capturedUrl`; the effect above
      // revokes whichever url was current whenever it changes.
      const input: AnalysisInput = { kind: 'photo', url: URL.createObjectURL(blob), meta, blob }
      setAnalysis((current) => (current && current.id === String(id) ? { ...current, input } : current))
      await finish(input, hints, id)
    },
    [beginRun, finish],
  )

  const startText = useCallback(
    async (description: string, hints: EstimateHints, slot: MealSlot, label: string) => {
      const id = ++runId.current
      const input: AnalysisInput = { kind: 'text', description: description.trim() }
      beginRun(
        {
          slot,
          label,
          input,
          hints,
          model: getEstimator().model,
          conversationId: newConversationId(),
          answers: [],
        },
        id,
      )
      await finish(input, hints, id)
    },
    [beginRun, finish],
  )

  /** Runs the same input again with whatever is currently known about it. */
  const rerun = useCallback(
    (from: Analysis, changes: { hints?: EstimateHints; answers?: FollowUp[] }) => {
      const id = ++runId.current
      const hints = changes.hints ?? from.hints
      const answers = changes.answers ?? from.answers
      beginRun(
        {
          slot: from.slot,
          label: from.label,
          input: from.input,
          hints,
          model: from.model,
          // Kept, not regenerated: this is still the same meal, and the server
          // charges it once.
          conversationId: from.conversationId,
          answers,
        },
        id,
      )
      void finish(from.input, hints, id, answers)
    },
    [beginRun, finish],
  )

  const restartWith = useCallback(
    (hints: EstimateHints) => {
      if (latest.current) rerun(latest.current, { hints })
    },
    [rerun],
  )

  const retry = useCallback(() => {
    if (latest.current) rerun(latest.current, {})
  }, [rerun])

  /**
   * The user answers the model's question, and the estimate is made again with
   * that taken as fact.
   *
   * Capped at `MAX_FOLLOW_UPS` because each round re-sends the photo and pays
   * for it. Past the cap the question simply stops being offered — nothing
   * fails, and the estimate on screen was always usable anyway.
   */
  const answerQuestion = useCallback(
    (answer: string) => {
      const said = answer.trim()
      const current = latest.current
      const question = current?.result?.question
      if (!said || !current || !question || current.answers.length >= MAX_FOLLOW_UPS) return
      rerun(current, { answers: [...current.answers, { question, answer: said }] })
    },
    [rerun],
  )

  const clear = useCallback(() => {
    runId.current += 1
    setConversationId(undefined)
    const url = photoUrlOf(latest.current)
    if (url) URL.revokeObjectURL(url)
    setAnalysis(undefined)
  }, [])

  return (
    <AnalysisContext.Provider
      value={{ analysis, start, startText, retry, restartWith, answerQuestion, clear }}
    >
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
