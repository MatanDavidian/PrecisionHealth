/**
 * Test double for the port. Also what the Log screen runs against in
 * development when no API key is configured and `?fake=1` is set, so the flow
 * can be exercised without spending anything.
 */
import type { EstimateHints, EstimateResult, FoodVisionEstimator } from './estimator'
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

export class FakeEstimator implements FoodVisionEstimator {
  readonly model = 'fake-vision'

  constructor(
    private readonly reply: unknown = SAMPLE_REPLY,
    private readonly failWith?: Error,
  ) {}

  async estimate(_photo: Blob, hints: EstimateHints): Promise<EstimateResult> {
    if (this.failWith) throw this.failWith
    const validated = validateEstimate(this.reply, this.model)
    return applyGramsHint(validated, hints.totalGrams)
  }
}
