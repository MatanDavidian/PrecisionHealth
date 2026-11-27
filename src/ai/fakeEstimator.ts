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
  LeftoverInput,
  PlatedFood,
} from './estimator'
import type { LeftoverEstimate, MealSuggestions, SuggestedFood, SuggestionRequest, WeekReport } from '@/domain'
import { applyGramsHint, validateEstimate, validateSuggestions } from './validate'

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
  /**
   * A believable leftover, derived from the plate it was given.
   *
   * Deterministic on purpose: the first food is finished and the rest are half
   * eaten, which is the shape the design draws and the shape the browser tests
   * assert. A sentence that plainly says everything went is honoured, because
   * a fake that ignores its input teaches the UI nothing.
   */
  async estimateLeftover(
    input: LeftoverInput,
    plate: readonly PlatedFood[],
    _hints: EstimateHints,
  ): Promise<LeftoverEstimate> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (this.failWith) throw this.failWith

    const said = 'description' in input ? input.description.toLowerCase() : ''
    /*
      Phrases, not words. Matching a bare "finished" read "finished the chicken,
      half the rice came back" as an empty plate — the word describes one food
      in a sentence whose whole point is that another was left.
    */
    const finished = /(nothing left|empty plate|plate is empty|ate everything|finished it all|all of it|all gone)/.test(
      said,
    )

    return {
      portions: plate.map((_food, index) => ({
        index,
        eatenFraction: finished || index === 0 ? 1 : 0.5,
        note: finished || index === 0 ? 'fully eaten' : 'about half eaten',
      })),
      model: this.model,
      confidence: 0.72,
    }
  }

  /**
   * Suggestions built from the request it was given: the person's two most
   * logged foods, their most logged meal, and one new idea, each scaled to fit
   * what is left. Run through the real validator, so a fake that would not
   * survive it fails here rather than looking right on screen.
   */
  async suggestMeals(request: SuggestionRequest, hints: EstimateHints): Promise<MealSuggestions> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    if (this.failWith) throw this.failWith
    // A browser test can hand the fake an exact reply, which still goes
    // through the real validator: how a cap's edge (120 shown, 121 dropped) is tested.
    const scripted = (globalThis as { __suggestReply?: unknown }).__suggestReply
    if (scripted) return validateSuggestions(scripted, this.model, request.maxKcal)
    const he = hints.language === 'he'
    const room = Math.max(40, (request.maxKcal || request.left.energyKcal) * 0.95)
    const r1 = (n: number) => Math.round(n * 10) / 10
    /** Scales foods down (never up) so their calories fit the room. */
    const fit = (foods: SuggestedFood[]): SuggestedFood[] => {
      const kcal = foods.reduce((sum, food) => sum + food.energyKcal, 0)
      const scale = kcal > room ? room / kcal : 1
      return foods.map((food) => ({
        name: food.name,
        amountG: Math.max(5, Math.round(food.amountG * scale)),
        energyKcal: Math.round(food.energyKcal * scale),
        proteinG: r1(food.proteinG * scale),
        carbsG: r1(food.carbsG * scale),
        fatG: r1(food.fatG * scale),
      }))
    }
    const suggestions: unknown[] = []

    const own = request.usualFoods.slice(0, 2).map((food) => ({
      name: food.name,
      amountG: food.usualG,
      energyKcal: Math.round((food.per100g.kcal * food.usualG) / 100),
      proteinG: r1((food.per100g.proteinG * food.usualG) / 100),
      carbsG: r1((food.per100g.carbsG * food.usualG) / 100),
      fatG: r1((food.per100g.fatG * food.usualG) / 100),
    }))
    if (own.length > 0) {
      suggestions.push({
        title: own.map((food) => food.name).join(he ? ' + ' : ' and '),
        source: 'FOODS',
        why: he
          ? `שני מזונות שאתם רושמים הכי הרבה, בתוך ${request.maxKcal} קלוריות.`
          : `Two foods you log most, within the ${request.maxKcal} kcal.`,
        foods: fit(own),
      })
    }

    const meal = request.usualMeals[0]
    if (meal) {
      const grams = meal.foods.reduce((sum, food) => sum + food.grams, 0) || 1
      const share = (food: { grams: number }) => food.grams / grams
      suggestions.push({
        title: meal.name,
        source: 'USUAL',
        why: he ? `הארוחה שאתם רושמים הכי הרבה, ${meal.timesLogged} פעמים.` : `Your most logged meal, ${meal.timesLogged} times.`,
        foods: fit(
          meal.foods.map((food) => ({
            name: food.name,
            amountG: food.grams,
            energyKcal: Math.round(meal.kcal * share(food)),
            proteinG: r1(meal.proteinG * share(food)),
            carbsG: r1(meal.carbsG * share(food)),
            fatG: r1(meal.fatG * share(food)),
          })),
        ),
      })
    }

    suggestions.push({
      title: he ? 'יוגורט יווני 0% עם פירות יער' : 'Greek yogurt 0% with berries',
      source: 'NEW',
      why: he ? 'משהו אחר: הרבה חלבון וכמעט בלי שומן.' : 'Something different: high in protein, almost no fat.',
      foods: fit([
        { name: he ? 'יוגורט יווני 0%' : 'Greek yogurt 0%', amountG: 250, energyKcal: 148, proteinG: 25, carbsG: 10, fatG: 0 },
        { name: he ? 'פירות יער' : 'Mixed berries', amountG: 100, energyKcal: 50, proteinG: 1, carbsG: 12, fatG: 0.3 },
      ]),
    })

    // A protein snack is lean protein only: the person's leanest food, and the yogurt.
    const offered = request.mode === 'PROTEIN' ? suggestions.filter((_, i) => i !== 1) : suggestions
    // Saying which rules it was given lets a browser test see the preferences arrive.
    const following = request.preferences?.diets.length
      ? `${he ? 'לפי ההעדפות' : 'Following'}: ${request.preferences.diets.join(', ')}.`
      : ''
    const rest = request.mode === 'PROTEIN' ? (he ? 'השאר יכול לחכות למחר.' : 'The rest can wait for tomorrow.') : ''
    return validateSuggestions(
      { suggestions: offered, note: [rest, following].filter(Boolean).join(' ') },
      this.model,
      request.maxKcal,
    )
  }

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
        // Over the days actually compared, not over seven — dividing by the length
        // of the week is precisely the misreading the report now names.
        `Eaten averaged ${Math.round(eatenKcal / Math.max(1, report.totals.comparedDays)).toLocaleString()} kcal a day across the ${report.totals.comparedDays} days compared.`,
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
