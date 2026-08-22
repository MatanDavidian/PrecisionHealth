/**
 * The food-vision prompt and pricing, shared by both callers.
 *
 * Two code paths reach OpenAI — the browser adapter on the user's own key, and
 * the edge function on the master key — and they must ask the same question,
 * or a user comparing the two would get different answers from the same photo
 * for no reason they could see. This file is the single source; the client
 * imports it, and Supabase bundles `_shared` into the function.
 */

export const SYSTEM_PROMPT = `You estimate nutrition from a single photo of food.

Reply with ONLY a JSON object of this exact shape:
{
  "items": [
    { "name": string, "amountG": number, "energyKcal": number,
      "proteinG": number, "carbsG": number, "fatG": number,
      "fiberG": number, "confidence": number }
  ],
  "overallConfidence": number,
  "assumptions": [string],
  "refusal": string
}

What counts as food to estimate:
- A plated or served meal.
- Loose or raw ingredients, groceries, packaged products, fruit in a bowl, a
  spread of several dishes — anything edible, whether or not it is a "meal".
- If several foods are visible, list each one separately.

Rules:
- Split what you see into the items a person would name, not every ingredient.
- All weights in grams, all energy in kilocalories, per item as served.
- "confidence" and "overallConfidence" are between 0 and 1. Be honest: a
  half-hidden portion or an ambiguous sauce deserves a low number.
- "assumptions" lists what you had to assume, in short plain sentences —
  cooked vs raw weight, invisible oil or dressing, hidden ingredients.
- Treat any user-supplied food name or total weight as GROUND TRUTH. If a
  weight is given, your amounts must sum to it. If a food is named, do not
  second-guess the identification; only portion and compute.
- Do not estimate vitamins or minerals. A photo does not carry that
  information.
- Estimate even when you are unsure. An honest low-confidence number is more
  useful than no answer; that is what "confidence" is for.
- Use "refusal" ONLY when the image contains no edible food at all (a person,
  a screenshot, a landscape). Being unable to identify a dish precisely is not
  a reason to refuse — estimate it as best you can and say so in
  "assumptions". When you do refuse, return an empty "items" array; otherwise
  omit "refusal" entirely.`

export interface EstimateHints {
  foodName?: string
  totalGrams?: number
}

export function hintText(hints: EstimateHints): string {
  const lines: string[] = []
  if (hints.foodName) lines.push(`The user says this is: ${hints.foodName}`)
  if (hints.totalGrams) lines.push(`The user weighed it: ${hints.totalGrams} g in total`)
  return lines.length > 0
    ? `${lines.join('\n')}\n\nTreat the above as ground truth.`
    : 'No hints were provided; identify and portion from the photo alone.'
}

/**
 * USD per million tokens, for turning a reported token count into a real cost.
 *
 * Prices drift; when they do, change them here and the ledger's future rows
 * follow. Past rows keep the cost they were charged at, which is the point of
 * storing it rather than recomputing.
 */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gpt-5.6-sol': { input: 5, output: 30 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

/** Cost in millionths of a dollar, so the ledger stores an integer. */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_RATES[model]
  if (!rate) return 0
  return Math.round(inputTokens * rate.input + outputTokens * rate.output)
}

/** What a trial is worth: ten analyses, once, for the life of the account. */
export const TRIAL_ANALYSES = 10

/**
 * How many of those ten may run on the best model.
 *
 * The trial opens on sol so the first impression is the app at its best, but
 * sol costs ~$0.11 and takes the better part of a minute — spending the whole
 * trial there is expensive and slow. Four is enough to prove what the app can
 * do; the rest run on terra, which is fast, cheap and still good.
 */
export const TRIAL_SOL_ANALYSES = 4

/**
 * After this many, the app moves itself to terra and says so.
 *
 * Not at four: switching only when the budget is gone would make the change
 * feel like a wall. Switching at two, with two still in reserve, makes it an
 * offer — the user has seen the best, is told what changed, and can go back
 * for the meals where accuracy actually matters.
 */
export const TRIAL_SOL_NUDGE_AT = 2

export const MODEL_SOL = 'gpt-5.6-sol'
export const MODEL_TERRA = 'gpt-5.6-terra'
export const MODEL_LUNA = 'gpt-5.6-luna'

/** The only models a trial may run. Anything else is refused server-side. */
export const TRIAL_MODELS = [MODEL_SOL, MODEL_TERRA, MODEL_LUNA] as const
export type TrialModel = (typeof TRIAL_MODELS)[number]

/** Where a trial starts: the best one. */
export const TRIAL_MODEL = MODEL_SOL

/** What each model is FOR, in the user's terms rather than the vendor's. */
export const MODEL_LABELS: Record<string, { name: string; detail: string }> = {
  [MODEL_SOL]: { name: 'Most accurate', detail: 'Reads a crowded plate carefully. Up to a minute.' },
  [MODEL_TERRA]: { name: 'Balanced', detail: 'Good estimates in about fifteen seconds.' },
  [MODEL_LUNA]: { name: 'Fastest', detail: 'Quick and rough. Best for simple, obvious meals.' },
}
