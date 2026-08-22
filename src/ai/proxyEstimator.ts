/**
 * Photo analysis through our own server, on the owner's key.
 *
 * The second estimator mode D14 reserved space for. It implements the same
 * port as the OpenAI adapter, so the Log screen cannot tell which one it is
 * holding — the whole reason that port exists.
 *
 * The browser never sees the master key, never counts the quota and never
 * decides entitlement: it sends a photo and gets either an estimate or a
 * refusal it can explain. Validation stays here, reusing exactly the rules the
 * direct adapter uses, so both paths produce identically-shaped results.
 */
import {
  EstimateError,
  type EstimateHints,
  type EstimateResult,
  type FoodVisionEstimator,
} from './estimator'
import { toDataUrl } from './photo'
import { applyGramsHint, validateEstimate } from './validate'

export interface TrialState {
  used: number
  allowance: number
}

export interface ProxyEstimatorOptions {
  /** Base URL of the Supabase project, e.g. https://ref.supabase.co */
  supabaseUrl: string
  anonKey: string
  /** The caller's access token. Read per call so a refreshed session is used. */
  getAccessToken: () => Promise<string | undefined>
  /** The user's local day, so a daily cap follows their calendar (D7). */
  getDay: () => string
  fetchImpl?: typeof fetch
}

/** Thrown when the free trial is spent — a product state, not a failure. */
export class TrialExhaustedError extends EstimateError {
  constructor(readonly used: number, readonly allowance: number) {
    super('QUOTA', `Free trial used (${used} of ${allowance})`)
    this.name = 'TrialExhaustedError'
  }
}

export class ProxyEstimator implements FoodVisionEstimator {
  /** Reported by the server after each call; the client never chooses it. */
  model = 'server'
  /** Latest trial state the server reported, for the UI to show. */
  trial?: TrialState

  constructor(private readonly options: ProxyEstimatorOptions) {}

  async estimate(photo: Blob, hints: EstimateHints): Promise<EstimateResult> {
    const token = await this.options.getAccessToken()
    if (!token) throw new EstimateError('NO_KEY', 'Not signed in')

    const doFetch = this.options.fetchImpl ?? fetch
    const dataUrl = await toDataUrl(photo)

    let response: Response
    try {
      response = await doFetch(`${this.options.supabaseUrl}/functions/v1/estimate-food`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.options.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ photo: dataUrl, hints, day: this.options.getDay() }),
      })
    } catch {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      throw new EstimateError(
        offline ? 'OFFLINE' : 'BLOCKED',
        offline ? 'The device is offline' : 'Could not reach the analysis service',
      )
    }

    const body = (await response.json().catch(() => null)) as
      | { content?: string; model?: string; trial?: TrialState; error?: string; used?: number; allowance?: number }
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

    let parsed: unknown
    try {
      parsed = JSON.parse(body.content)
    } catch {
      throw new EstimateError('UNREADABLE', 'Reply was not JSON', body.content)
    }

    return applyGramsHint(validateEstimate(parsed, this.model), hints.totalGrams)
  }
}
