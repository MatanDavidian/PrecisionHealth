/**
 * The food-estimate port (D14).
 *
 * The UI depends on this interface; the adapter behind it is chosen in the
 * composition root, exactly as the store is (D3). Today it is OpenAI called
 * directly from the browser on the user's own key. When the backend exists, a
 * server-proxy adapter implements the same interface and BYOK becomes one of
 * two modes rather than a rewrite.
 *
 * Two inputs, one port: a photo and a written description are the same
 * question asked with different evidence, and they return the same shape so
 * everything downstream — validation, the result card, the Confirm flow, the
 * audit record — is written once.
 */

// The conversation shape lives with the prompt, so the client and the edge
// function cannot disagree about what a follow-up round looks like.
import type { FollowUp } from '../../supabase/functions/_shared/prompt'
export type { FollowUp }

/** Optional user input. The model must treat these as ground truth, not suggestions. */
export interface EstimateHints {
  /** "cottage cheese 5%", "2 eggs" — identification is then given, not guessed. */
  foodName?: string
  /** Total cooked weight. The single biggest accuracy lever: the model scales to it. */
  totalGrams?: number
  /**
   * Anything a photo cannot show: "no oil", "half of this was left", "the
   * sauce is on the side".
   *
   * The cheapest accuracy there is. A picture cannot see how something was
   * cooked or how much came back to the kitchen, and the person holding the
   * camera knows both — so a sentence from them beats a better model.
   */
  note?: string
  /**
   * Which language the reply's words should be in.
   *
   * Not a preference the model may weigh — a Hebrew reader looking at Hebrew
   * buttons should not be handed English food names. Only the values are
   * translated; the JSON shape is a contract with a parser.
   */
  language?: 'en' | 'he'
}

export interface EstimatedItem {
  name: string
  amountG: number
  energyKcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG?: number
  /** 0..1, the model's own confidence in THIS item. */
  confidence: number
}

/** What the photo was, without keeping the photo (spec §3, §4). */
export interface PhotoMeta {
  width: number
  height: number
  bytes: number
  sha256: string
}

export interface EstimateResult {
  items: EstimatedItem[]
  /** 0..1 across the whole estimate. */
  overallConfidence: number
  /** Shown to the user verbatim: "assumed cooked weight", "no oil visible". */
  assumptions: string[]
  /** Set when the model says the image is not food. Then `items` is empty. */
  refusal?: string
  /**
   * One thing the model could not see and would like to know.
   *
   * Never instead of an estimate — the items above are always usable, and
   * answering is always optional. Absent most of the time.
   */
  question?: string
  /**
   * Why it is asking — which number is shaky, and what was assumed.
   *
   * Without this a question is an interrogation: the user is asked to work
   * for the model with no idea what it buys them. With it, they can judge
   * whether answering is worth the tap.
   */
  questionReason?: string
  /** Two to four tappable answers. Shortcuts, never the only options. */
  questionOptions?: string[]
  /** Non-fatal audit notes, e.g. MACRO_ARITHMETIC_MISMATCH. */
  flags: string[]
  /** The model's reply exactly as received, kept for the AIInference row. */
  raw: unknown
  model: string
}

export interface FoodEstimator {
  /** The name that goes into the audit record. */
  readonly model: string
  /**
   * `answers` carries the conversation so far, when the model asked something
   * and the user replied. An extra parameter rather than a second method: the
   * question is a refinement of the same request, on the same evidence, and
   * modelling it as a separate call would duplicate every adapter.
   */
  estimate(photo: Blob, hints: EstimateHints, answers?: readonly FollowUp[]): Promise<EstimateResult>
  /**
   * The same estimate from a sentence: "two eggs on toast and a black coffee".
   *
   * For the meal you eat often but have never photographed, and for the one
   * you already ate. Cheaper and faster than a photo, and honestly less
   * certain — the confidence that comes back says so.
   */
  estimateFromText(
    description: string,
    hints: EstimateHints,
    answers?: readonly FollowUp[],
  ): Promise<EstimateResult>
}

/**
 * The port's old name, from when a photo was the only way in.
 *
 * Kept as an alias because it is quoted throughout the specs; new code should
 * say `FoodEstimator`.
 */
export type FoodVisionEstimator = FoodEstimator

/** Thrown for every failure the user could act on. `kind` drives the message. */
export class EstimateError extends Error {
  constructor(
    readonly kind:
      | 'NO_KEY'
      | 'BAD_KEY'
      | 'RATE_LIMIT'
      | 'PROVIDER'
      | 'OFFLINE'
      | 'BLOCKED'
      | 'QUOTA'
      | 'UNREADABLE',
    message: string,
    /** Kept so even a failure can be written to the audit trail. */
    readonly raw?: unknown,
  ) {
    super(message)
    this.name = 'EstimateError'
  }
}

export const ESTIMATE_ERROR_TEXT: Record<EstimateError['kind'], string> = {
  NO_KEY: 'No API key yet — add one in Settings to analyze photos.',
  BAD_KEY: 'The provider rejected your API key. Check it in Settings.',
  RATE_LIMIT: 'The provider is busy or over quota. Try again shortly.',
  PROVIDER: 'The provider returned an error. Try again shortly.',
  OFFLINE: "You're offline — analyzing a photo needs a connection.",
  BLOCKED:
    'The request never reached OpenAI. This is usually a rejected key, an ad blocker or privacy extension, or a browser restriction on calling the API directly — check the key in Settings first.',
  QUOTA: 'Your free analyses are used up — add your own OpenAI key to carry on.',
  UNREADABLE: "Couldn't read the analysis. Try again, or log it manually.",
}
