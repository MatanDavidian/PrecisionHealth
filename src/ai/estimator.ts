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
  /** Non-fatal audit notes, e.g. MACRO_ARITHMETIC_MISMATCH. */
  flags: string[]
  /** The model's reply exactly as received, kept for the AIInference row. */
  raw: unknown
  model: string
}

export interface FoodEstimator {
  /** The name that goes into the audit record. */
  readonly model: string
  estimate(photo: Blob, hints: EstimateHints): Promise<EstimateResult>
  /**
   * The same estimate from a sentence: "two eggs on toast and a black coffee".
   *
   * For the meal you eat often but have never photographed, and for the one
   * you already ate. Cheaper and faster than a photo, and honestly less
   * certain — the confidence that comes back says so.
   */
  estimateFromText(description: string, hints: EstimateHints): Promise<EstimateResult>
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
