/**
 * Food analysis — photo or description — through our own server, on the
 * owner's key.
 *
 * The second estimator mode D14 reserved space for. It implements the same
 * port as the OpenAI adapter, so the Log screen cannot tell which one it is
 * holding — the whole reason that port exists.
 *
 * The browser never sees the master key, never counts the quota and never
 * decides entitlement: it sends a photo or a sentence and gets either an
 * estimate or a refusal it can explain. Validation stays here, reusing exactly
 * the rules the direct adapter uses, so both paths produce identically-shaped
 * results.
 */
import {
  EstimateError,
  type EstimateHints,
  type EstimateResult,
  type FollowUp,
  type FoodEstimator,
  type LeftoverInput,
  type PlatedFood,
  type WeekInsight,
} from './estimator'
import { toDataUrl } from './photo'
import { applyGramsHint, validateEstimate, validateInsight, validateLeftover } from './validate'
import type { LeftoverEstimate, WeekReport } from '@/domain'

export interface TrialState {
  used: number
  allowance: number
  solUsed?: number
  solAllowance?: number
}

export interface ProxyEstimatorOptions {
  /** Base URL of the Supabase project, e.g. https://ref.supabase.co */
  supabaseUrl: string
  anonKey: string
  /** The caller's access token. Read per call so a refreshed session is used. */
  getAccessToken: () => Promise<string | undefined>
  /** The user's local day, so a daily cap follows their calendar (D7). */
  getDay: () => string
  /** Which model to ask for. The server clamps it to what is actually allowed. */
  getModel: () => Promise<string | undefined>
  /**
   * Which meal this call is about, so the server can charge a conversation
   * once. Read per call because it changes with every new photo.
   */
  getConversationId?: () => string | undefined
  fetchImpl?: typeof fetch
}

/** Thrown when the free trial is spent — a product state, not a failure. */
export class TrialExhaustedError extends EstimateError {
  constructor(readonly used: number, readonly allowance: number) {
    super('QUOTA', `Free trial used (${used} of ${allowance})`)
    this.name = 'TrialExhaustedError'
  }
}

export class ProxyEstimator implements FoodEstimator {
  /** Reported by the server after each call; the client never chooses it. */
  model = 'server'
  /** Latest trial state the server reported, for the UI to show. */
  trial?: TrialState
  /**
   * True when the server ran a different model than was asked for, because the
   * best one's budget is spent. Surfaced rather than swallowed.
   */
  downgraded = false

  constructor(private readonly options: ProxyEstimatorOptions) {}

  async estimate(
    photo: Blob,
    hints: EstimateHints,
    answers: readonly FollowUp[] = [],
  ): Promise<EstimateResult> {
    return this.send({ photo: await toDataUrl(photo) }, hints, answers)
  }

  async estimateFromText(
    description: string,
    hints: EstimateHints,
    answers: readonly FollowUp[] = [],
  ): Promise<EstimateResult> {
    if (!description.trim()) {
      throw new EstimateError('UNREADABLE', 'There is nothing written to estimate')
    }
    return this.send({ text: description.trim() }, hints, answers)
  }

  /**
   * A leftover, judged on the server.
   *
   * The plate travels with the request because the server holds the prompt and
   * the key; the browser only knows which meal it is looking at. Same transport
   * as everything else here — one endpoint, a different field.
   */
  async estimateLeftover(
    input: LeftoverInput,
    plate: readonly PlatedFood[],
    hints: EstimateHints,
  ): Promise<LeftoverEstimate> {
    const leftover =
      'photo' in input
        ? { photo: await toDataUrl(input.photo), plate }
        : { text: input.description, plate }
    return this.send({ leftover }, hints, [], (parsed, model) =>
      validateLeftover(parsed, model, plate.length),
    ) as Promise<LeftoverEstimate>
  }

  async weekInsights(report: WeekReport, hints: EstimateHints): Promise<WeekInsight> {
    return this.send({ report }, hints, [], validateInsight) as Promise<WeekInsight>
  }

  /**
   * One request, whichever input it carries.
   *
   * The server decides everything that matters — which model, whose key, and
   * whether this call is allowed at all — so photo and text differ here by a
   * single field and nothing else. The trial counts both the same way, because
   * from the payer's side they are the same call.
   */
  private async send<T = EstimateResult>(
    input:
      | { photo: string }
      | { text: string }
      | { report: WeekReport }
      | { leftover: { photo?: string; text?: string; plate: readonly PlatedFood[] } },
    hints: EstimateHints,
    answers: readonly FollowUp[] = [],
    /** How to read the reply. The transport is identical either way. */
    read: (parsed: unknown, model: string) => T = ((p: unknown, m: string) =>
      applyGramsHint(validateEstimate(p, m), hints.totalGrams)) as never,
  ): Promise<T> {
    const token = await this.options.getAccessToken()
    if (!token) throw new EstimateError('NO_KEY', 'Not signed in')

    const doFetch = this.options.fetchImpl ?? fetch

    let response: Response
    try {
      response = await doFetch(`${this.options.supabaseUrl}/functions/v1/estimate-food`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.options.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...input,
          hints,
          day: this.options.getDay(),
          model: await this.options.getModel(),
          // The server counts follow-ups against the conversation, not the
          // trial — so it has to be able to tell which meal this belongs to.
          ...(answers.length > 0 ? { answers } : {}),
          conversationId: this.options.getConversationId?.(),
        }),
      })
    } catch {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      throw new EstimateError(
        offline ? 'OFFLINE' : 'BLOCKED',
        offline ? 'The device is offline' : 'Could not reach the analysis service',
      )
    }

    const body = (await response.json().catch(() => null)) as
      | {
          content?: string
          model?: string
          trial?: TrialState
          downgraded?: boolean
          error?: string
          used?: number
          allowance?: number
        }
      | null

    if (response.status === 402 && body?.error === 'trial_exhausted') {
      throw new TrialExhaustedError(body.used ?? 0, body.allowance ?? 0)
    }
    if (response.status === 401) throw new EstimateError('NO_KEY', 'Session expired — sign in again')
    if (!response.ok || !body?.content) {
      if (body?.error === 'free_analysis_unavailable') {
        // The owner's budget, not the user's trial — and their own key still
        // works, so say that rather than leaving them looking for a fault.
        throw new EstimateError(
          'QUOTA',
          'Free analyses are unavailable right now — add your own OpenAI key to carry on',
          body,
        )
      }
      throw new EstimateError(
        'PROVIDER',
        body?.error === 'master_key_missing'
          ? 'Analysis is not configured on the server yet'
          : 'The analysis service could not complete this',
        body,
      )
    }

    if (body.model) this.model = body.model
    if (body.trial) this.trial = body.trial
    this.downgraded = Boolean(body.downgraded)

    let parsed: unknown
    try {
      parsed = JSON.parse(body.content)
    } catch {
      throw new EstimateError('UNREADABLE', 'Reply was not JSON', body.content)
    }

    return read(parsed, this.model)
  }
}
