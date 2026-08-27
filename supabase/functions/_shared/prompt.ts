/**
 * The food-estimate prompts and pricing, shared by every caller.
 *
 * Two code paths reach OpenAI — the browser adapter on the user's own key, and
 * the edge function on the master key — and they must ask the same question,
 * or a user comparing the two would get different answers from the same photo
 * for no reason they could see. This file is the single source; the client
 * imports it, and Supabase bundles `_shared` into the function.
 *
 * There are two prompts, not two prompt files: photo and text differ only in
 * what the model is looking at and how sure it may reasonably be. Everything
 * they share — the JSON shape, the units, the honesty rules — is defined once
 * below, so the two cannot drift into answering differently about the same
 * plate.
 */

/** The reply shape and the rules that hold whatever the input was. */
const REPLY_CONTRACT = `Reply with ONLY a JSON object of this exact shape:
{
  "items": [
    { "name": string, "amountG": number, "energyKcal": number,
      "proteinG": number, "carbsG": number, "fatG": number,
      "fiberG": number, "confidence": number }
  ],
  "overallConfidence": number,
  "assumptions": [string],
  "question": string,
  "refusal": string
}

Rules:
- Split the food into the items a person would name, not every ingredient.
- All weights in grams, all energy in kilocalories, per item as served.
- "confidence" and "overallConfidence" are between 0 and 1. Be honest: an
  ambiguous sauce or an unstated portion deserves a low number.
- "assumptions" lists what you had to assume, in short plain sentences —
  cooked vs raw weight, invisible oil or dressing, hidden ingredients.
- Treat any user-supplied food name or total weight as GROUND TRUTH. If a
  weight is given, your amounts must sum to it. If a food is named, do not
  second-guess the identification; only portion and compute.
- Do not estimate vitamins or minerals. Neither a photo nor a sentence carries
  that information.
- Estimate even when you are unsure. An honest low-confidence number is more
  useful than no answer; that is what "confidence" is for.

Asking a question:
- You may include ONE short "question" when a single fact you cannot see
  would materially change the numbers — fried or grilled, whole or skimmed
  milk, how large the bowl was, whether the dressing was eaten.
- A question NEVER replaces the estimate. Always return your best items and
  confidence as well; the user must be able to ignore the question entirely
  and still have a usable answer.
- Ask only when the answer is worth the interruption. Omit "question"
  entirely when nothing material is unclear, which is most of the time.
- Never ask for something the user already told you in the hints.`

export const SYSTEM_PROMPT = `You estimate nutrition from a single photo of food.

What counts as food to estimate:
- A plated or served meal.
- Loose or raw ingredients, groceries, packaged products, fruit in a bowl, a
  spread of several dishes — anything edible, whether or not it is a "meal".
- If several foods are visible, list each one separately.

${REPLY_CONTRACT}
- Use "refusal" ONLY when the image contains no edible food at all (a person,
  a screenshot, a landscape). Being unable to identify a dish precisely is not
  a reason to refuse — estimate it as best you can and say so in
  "assumptions". When you do refuse, return an empty "items" array; otherwise
  omit "refusal" entirely.`

/**
 * The same job from a sentence instead of a photograph.
 *
 * Deliberately NOT a copy of the photo prompt with the word "photo" swapped
 * out. Text carries less than a picture — no portion, no visible oil, no idea
 * how big the bowl was — and a model told to behave identically will return
 * identical-looking confidence for a far weaker inference. So this one is
 * explicit that ordinary portions are being assumed and that the confidence
 * must say so, which is what keeps the number on screen honest.
 */
export const TEXT_SYSTEM_PROMPT = `You estimate nutrition from a short written description of food.

What counts as food to estimate:
- Anything edible the user describes, however loosely: a meal, a snack, a
  single ingredient, a drink, a packaged product.
- If several foods are described, list each one separately.

${REPLY_CONTRACT}
- Where no portion is given, assume an ordinary serving for that food, say so
  in "assumptions", and let "confidence" reflect that you are portioning
  blind. A described meal deserves lower confidence than a photographed one.
- Use "refusal" ONLY when the text describes no food at all. When you do
  refuse, return an empty "items" array; otherwise omit "refusal" entirely.`

/** The longest free text worth sending. Past this it is a diary, not a meal. */
export const MAX_DESCRIPTION_CHARS = 500

export interface EstimateHints {
  foodName?: string
  totalGrams?: number
  /** Free text the user added alongside a photo: "no oil", "half portion". */
  note?: string
  /** Which language the reply's words should be in. Defaults to English. */
  language?: 'en' | 'he'
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', he: 'Hebrew' }

/**
 * Asks for the reply's words — and only its words — in the user's language.
 *
 * The insistence that keys stay English is not pedantry: a model told to
 * "reply in Hebrew" will helpfully translate `"items"` and `"amountG"` too,
 * and then nothing parses. Values are prose for a person; keys are a contract
 * with a parser, and the two need saying apart.
 */
export function languageRule(language?: string): string {
  const name = language ? LANGUAGE_NAMES[language] : undefined
  if (!name || language === 'en') return ''
  return `\n\nReply in ${name}: the "name", "assumptions" and "question" values must be written in ${name}. The JSON keys, the field names and every number stay exactly as specified above — translate the words, never the shape.`
}

/** A note is free text from a person, so it is quoted rather than instructed. */
const noteLine = (note: string): string =>
  `The user adds, between the markers:\n<<<\n${note.trim().slice(0, MAX_DESCRIPTION_CHARS)}\n>>>`

export function hintText(hints: EstimateHints): string {
  const lines: string[] = []
  if (hints.foodName) lines.push(`The user says this is: ${hints.foodName}`)
  if (hints.totalGrams) lines.push(`The user weighed it: ${hints.totalGrams} g in total`)
  if (hints.note?.trim()) lines.push(noteLine(hints.note))
  return lines.length > 0
    ? `${lines.join('\n')}\n\nTreat the above as ground truth about the food in the photo.`
    : 'No hints were provided; identify and portion from the photo alone.'
}

/**
 * The user message for a written meal.
 *
 * The description is quoted rather than concatenated into an instruction, so a
 * sentence that happens to read like one ("ignore the rules above") arrives as
 * the thing being estimated rather than as something to obey.
 */
export function describedFoodText(description: string, hints: EstimateHints): string {
  const trimmed = description.trim().slice(0, MAX_DESCRIPTION_CHARS)
  const parts = [`The user describes what they ate, between the markers:\n<<<\n${trimmed}\n>>>`]
  if (hints.foodName) parts.push(`They also name it as: ${hints.foodName}`)
  if (hints.totalGrams) parts.push(`They weighed it: ${hints.totalGrams} g in total`)
  if (hints.note?.trim()) parts.push(noteLine(hints.note))
  parts.push(
    hints.foodName || hints.totalGrams
      ? 'Treat the name and weight as ground truth.'
      : 'No weight was given; assume ordinary portions and say so.',
  )
  return parts.join('\n\n')
}

/**
 * How many follow-up answers a single meal may buy without spending another
 * analysis.
 *
 * A conversation about one breakfast is one analysis; a user who answers two
 * questions has not used three of their ten free photos. Bounded because each
 * round re-sends the photo and pays for it again — generous, not unlimited.
 */
export const MAX_FOLLOW_UPS = 2

/** One question the model asked, and what the user said back. */
export interface FollowUp {
  question: string
  answer: string
}

/**
 * The exchange so far, appended to the original request.
 *
 * The provider's API is stateless, so every round re-sends the original
 * evidence and the conversation with it. The answer is quoted between markers
 * for the same reason a note is: it is text from a person, and a sentence that
 * reads like an instruction must arrive as data.
 */
export function followUpText(answers: readonly FollowUp[]): string {
  if (answers.length === 0) return ''
  const rounds = answers.map(
    (round) =>
      `You asked: ${JSON.stringify(round.question)}\n` +
      `The user answers, between the markers:\n<<<\n` +
      `${round.answer.trim().slice(0, MAX_DESCRIPTION_CHARS)}\n>>>`,
  )
  return `${rounds.join('\n\n')}\n\nRe-estimate with these answers taken as ground truth. Do not ask again about anything already answered.`
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
