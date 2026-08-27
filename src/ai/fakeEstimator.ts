/**
 * Test double for the port. Also what the Log screen runs against in
 * development when no API key is configured and `?fake=1` is set, so the flow
 * can be exercised without spending anything.
 */
import type { EstimateHints, EstimateResult, FollowUp, FoodEstimator } from './estimator'
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
  question: 'Was the chicken grilled dry, or cooked in oil or butter?',
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

  async estimate(
    _photo: Blob,
    hints: EstimateHints,
    answers: readonly FollowUp[] = [],
  ): Promise<EstimateResult> {
    return this.answer(hints, answers)
  }

  /**
   * Text answers the same sample meal at lower confidence.
   *
   * Not laziness: the fake exists so the flow can be exercised, and the thing
   * a developer most needs to see in the text flow is that the numbers arrive
   * less certain than a photo's — which is what the UI says out loud.
   */
  async estimateFromText(
    _description: string,
    hints: EstimateHints,
    answers: readonly FollowUp[] = [],
  ): Promise<EstimateResult> {
    const result = await this.answer(hints, answers)
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

  /**
   * Answering the question tightens the estimate, exactly as a real one would.
   *
   * The fake asks on the first pass and stops once answered, so the whole
   * conversation — question, answer, a firmer second estimate — can be walked
   * through without spending anything. Confidence rises because the model now
   * knows the thing it said it was guessing at.
   */
  private async answer(
    hints: EstimateHints,
    answers: readonly FollowUp[],
  ): Promise<EstimateResult> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (this.failWith) throw this.failWith
    const validated = validateEstimate(this.reply, this.model)
    const result = applyGramsHint(validated, hints.totalGrams)
    if (answers.length === 0) return result
    return {
      ...result,
      question: undefined,
      overallConfidence: Math.min(1, result.overallConfidence + 0.2),
      items: result.items.map((item) => ({
        ...item,
        confidence: Math.min(1, item.confidence + 0.2),
      })),
      assumptions: [
        ...result.assumptions,
        `You said: ${answers[answers.length - 1].answer}`,
      ],
    }
  }
}
