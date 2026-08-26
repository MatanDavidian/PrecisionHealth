/**
 * Test double for the port. Also what the Log screen runs against in
 * development when no API key is configured and `?fake=1` is set, so the flow
 * can be exercised without spending anything.
 */
import type { EstimateHints, EstimateResult, FoodEstimator } from './estimator'
import { applyGramsHint, validateEstimate } from './validate'

export const SAMPLE_REPLY = {
  items: [
    {
      name: 'Grilled chicken breast',
      amountG: 170,
      energyKcal: 281,
      proteinG: 53,
      carbsG: 0,
      fatG: 6,
      confidence: 0.72,
    },
    {
      name: 'Rice and vegetables',
      amountG: 280,
      energyKcal: 430,
      proteinG: 11,
      carbsG: 86,
      fatG: 5,
      confidence: 0.61,
    },
  ],
  overallConfidence: 0.67,
  assumptions: ['Assumed cooked weights.', 'No added oil visible.'],
}

export class FakeEstimator implements FoodEstimator {
  readonly model = 'fake-vision'

  constructor(
    private readonly reply: unknown = SAMPLE_REPLY,
    private readonly failWith?: Error,
    /**
     * Pretend to think.
     *
     * The real models take fifteen to forty-five seconds, and everything
     * interesting about the waiting experience — the progress on the photo,
     * the docked bar, the tab dot — only exists during that window. An
     * estimator that answers instantly makes all of it unobservable, so
     * `?fake=1&slow=6000` buys six seconds to look at it.
     */
    private readonly delayMs = 0,
  ) {}

  async estimate(_photo: Blob, hints: EstimateHints): Promise<EstimateResult> {
    return this.answer(hints)
  }

  /**
   * Text answers the same sample meal at lower confidence.
   *
   * Not laziness: the fake exists so the flow can be exercised, and the thing
   * a developer most needs to see in the text flow is that the numbers arrive
   * less certain than a photo's — which is what the UI says out loud.
   */
  async estimateFromText(_description: string, hints: EstimateHints): Promise<EstimateResult> {
    const result = await this.answer(hints)
    return {
      ...result,
      overallConfidence: Math.max(0, result.overallConfidence - 0.15),
      items: result.items.map((item) => ({
        ...item,
        confidence: Math.max(0, item.confidence - 0.15),
      })),
      assumptions: [...result.assumptions, 'Portions were assumed; nothing was seen.'],
    }
  }

  private async answer(hints: EstimateHints): Promise<EstimateResult> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (this.failWith) throw this.failWith
    const validated = validateEstimate(this.reply, this.model)
    return applyGramsHint(validated, hints.totalGrams)
  }
}
