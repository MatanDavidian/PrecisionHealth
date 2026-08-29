/**
 * Test double for the port. Also what the Log screen runs against in
 * development when no API key is configured and `?fake=1` is set, so the flow
 * can be exercised without spending anything.
 */
import type {
  EstimateHints,
  EstimateResult,
  FollowUp,
  FoodEstimator,
  WeekInsight,
} from './estimator'
import type { WeekReport } from '@/domain'
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
  question: 'Was anything cooked in oil or butter?',
  questionReason:
    'Fat is the number I am least sure of — 6 g assumes a dry pan. Everything else on the plate I can see.',
  questionOptions: ['No oil or butter', 'About a teaspoon', 'About a tablespoon', 'Not sure'],
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
   * A believable week reading, built from the report it was actually given.
   *
   * Quoting the real totals matters: an insight card full of invented numbers
   * looks right in a screenshot and hides the fact that nothing was wired up.
   */
  async weekInsights(report: WeekReport, _hints: EstimateHints): Promise<WeekInsight> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (this.failWith) throw this.failWith
    const { eatenKcal, burnedKcal, netKcal, daysWithBurn } = report.totals
    const sparse = daysWithBurn < 5
    return {
      summary: sparse
        ? `Only ${daysWithBurn} of seven days carry a burn figure, so this is a partial picture.`
        : `You ate ${eatenKcal.toLocaleString()} kcal against ${burnedKcal.toLocaleString()} burned — a net of ${netKcal > 0 ? '+' : ''}${netKcal.toLocaleString()}.`,
      observations: [
        `Eaten averaged ${Math.round(eatenKcal / Math.max(1, report.days.length)).toLocaleString()} kcal a day.`,
        `Protein came to ${Math.round(report.totals.proteinG)} g across the week.`,
        report.goal.aimKcal === null
          ? 'No calorie target on this goal, so the balance is context rather than a score.'
          : `The goal asked for ${report.goal.aimKcal.toLocaleString()} and you landed ${report.goal.gapKcal > 0 ? 'above' : 'below'} it.`,
      ],
      suggestions: sparse
        ? []
        : ['Add a protein source at breakfast on the days you train.'],
      confidence: sparse ? 0.35 : 0.72,
      raw: { fake: true },
      model: this.model,
    }
  }

  /**
   * Answering the question tightens the estimate, exactly as a real one would.
   *
   * The fake asks on the first pass and stops once answered, so the whole
   * conversation — question, answer, a firmer second estimate — can be walked
   * through without spending anything. It also has to actually MOVE the
   * numbers: the revised card is mostly deltas and a "what this added" row,
   * and a fake that answers with the same figures leaves every one of them
   * reading "unchanged", which is a state nobody can check.
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

    const said = answers[answers.length - 1].answer.toLowerCase()
    // "No oil or butter" contains "butter". Substring matching alone would
    // add fat to a plate the user just said had none.
    const denied = /\b(no|none|without|nothing|dry)\b/.test(said)
    const added = denied ? undefined : FAT_ANSWERS.find((entry) => said.includes(entry.match))

    return {
      ...result,
      question: undefined,
      questionReason: undefined,
      questionOptions: undefined,
      overallConfidence: Math.min(1, result.overallConfidence + 0.2),
      items: [
        ...result.items.map((item) => ({
          ...item,
          confidence: Math.min(1, item.confidence + 0.2),
        })),
        ...(added
          ? [
              {
                name: added.name,
                amountG: added.grams,
                energyKcal: added.kcal,
                proteinG: 0,
                carbsG: 0,
                fatG: added.fat,
                confidence: 0.9,
              },
            ]
          : []),
      ],
      assumptions: [
        ...result.assumptions,
        `You said: ${answers[answers.length - 1].answer}`,
      ],
    }
  }
}

/**
 * What the fake does with an answer about cooking fat.
 *
 * Rough but real numbers, so the delta on screen is worth reading while
 * developing rather than being a placeholder.
 */
const FAT_ANSWERS = [
  { match: 'tablespoon', name: 'Olive oil · 1 tbsp', grams: 14, kcal: 120, fat: 14 },
  { match: 'teaspoon', name: 'Olive oil · 1 tsp', grams: 5, kcal: 40, fat: 5 },
  { match: 'butter', name: 'Butter · 15 g', grams: 15, kcal: 105, fat: 12 },
]
