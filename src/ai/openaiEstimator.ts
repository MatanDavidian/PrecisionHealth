/**
 * OpenAI adapter (D14) — called directly from the browser on the user's key.
 *
 * The key is read from settings at call time, never captured at construction,
 * so changing it in Settings takes effect immediately.
 */
import {
  EstimateError,
  type EstimateHints,
  type EstimateResult,
  type FollowUp,
  type FoodEstimator,
  type WeekInsight,
  type LeftoverInput,
  type PlatedFood,
} from './estimator'
import { toDataUrl } from './photo'
import type { LeftoverEstimate } from '@/domain'
// One prompt, shared with the edge function: two paths to the same provider
// must ask the same question, or the same photo answers differently depending
// on whose key paid for it.
import {
  INSIGHTS_SYSTEM_PROMPT,
  LEFTOVER_SYSTEM_PROMPT,
  plateLines,
  SYSTEM_PROMPT,
  TEXT_SYSTEM_PROMPT,
  describedFoodText,
  followUpText,
  hintText,
  insightsLanguageRule,
  languageRule,
} from '../../supabase/functions/_shared/prompt'
import { applyGramsHint, validateEstimate, validateInsight, validateLeftover } from './validate'
import type { WeekReport } from '@/domain'

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

/**
 * Generous on purpose. On reasoning models this budget covers hidden reasoning
 * tokens as well as the reply, and a cap that runs out mid-thought returns
 * EMPTY content — the estimate fails rather than degrading. Unused budget is
 * not billed, so the only cost of setting this high is on models that actually
 * think that long, which is precisely when we want them to finish.
 */
export const MAX_COMPLETION_TOKENS = 4000

export interface OpenAiEstimatorOptions {
  /** Read fresh on every call so a key change in Settings applies at once. */
  getApiKey: () => Promise<string | undefined>
  getModel: () => Promise<string>
  fetchImpl?: typeof fetch
}

export class OpenAiEstimator implements FoodEstimator {
  /**
   * Filled in on the first call; the audit row records what actually ran.
   * Deliberately not defaulted to a model name here — the default belongs to
   * the settings contract, not to this adapter.
   */
  model = '(unset)'

  constructor(private readonly options: OpenAiEstimatorOptions) {}

  async estimate(
    photo: Blob,
    hints: EstimateHints,
    answers: readonly FollowUp[] = [],
  ): Promise<EstimateResult> {
    const dataUrl = await toDataUrl(photo)
    return this.ask(
      SYSTEM_PROMPT,
      [
        { type: 'text', text: hintText(hints) },
        // 'auto' rather than 'low': a 512px thumbnail is too coarse to judge a
        // portion from, and portion size is most of the estimate. The photo is
        // already downscaled to 1280px before it gets here.
        { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
      ],
      hints,
      answers,
      validateEstimate,
      (result, h) => applyGramsHint(result, h.totalGrams),
    )
  }

  async estimateFromText(
    description: string,
    hints: EstimateHints,
    answers: readonly FollowUp[] = [],
  ): Promise<EstimateResult> {
    if (!description.trim()) {
      throw new EstimateError('UNREADABLE', 'There is nothing written to estimate')
    }
    return this.ask(
      TEXT_SYSTEM_PROMPT,
      describedFoodText(description, hints),
      hints,
      answers,
      validateEstimate,
      (result, h) => applyGramsHint(result, h.totalGrams),
    )
  }

  /**
   * How much of a served meal came back.
   *
   * The plate goes with the question, indexed, because the reply has to say
   * WHICH food was left and a name cannot carry that across languages. Photo
   * and sentence use the same prompt: the model is judging proportion either
   * way, and the only difference is what it is looking at.
   */
  async estimateLeftover(
    input: LeftoverInput,
    plate: readonly PlatedFood[],
    hints: EstimateHints,
  ): Promise<LeftoverEstimate> {
    const served = `This meal was served:\n${plateLines(plate)}`
    const content =
      'photo' in input
        ? [
            { type: 'text', text: `${served}\n\nThis is what is left on the plate.` },
            { type: 'image_url', image_url: { url: await toDataUrl(input.photo), detail: 'low' } },
          ]
        : `${served}\n\nWhat is left, in the person's own words:\n<<<\n${input.description}\n>>>`

    return this.ask(
      LEFTOVER_SYSTEM_PROMPT + languageRule(hints.language),
      content,
      {},
      [],
      (raw, model) => validateLeftover(raw, model, plate.length),
    )
  }

  async weekInsights(report: WeekReport, hints: EstimateHints): Promise<WeekInsight> {
    const content = await this.ask(
      INSIGHTS_SYSTEM_PROMPT + insightsLanguageRule(hints.language),
      // The report goes as JSON rather than prose: it is data the model should
      // read, and rewriting it into sentences would only lose precision.
      `Here is the week, as JSON:\n${JSON.stringify(report)}`,
      {},
      [],
      validateInsight,
    )
    return content
  }

  /**
   * One question, however it was asked.
   *
   * Photo and text differ only in the system prompt and the user content; the
   * awkward parts — which dialect of token limit this model speaks, whether it
   * knows JSON mode, the single repair attempt — are the same for both and
   * live here rather than in two near-identical copies.
   */
  private async ask<T>(
    systemPrompt: string,
    userContent: unknown,
    hints: EstimateHints,
    answers: readonly FollowUp[] = [],
    /** What to make of the reply. Estimates and insights differ only here. */
    read: (parsed: unknown, model: string) => T = validateEstimate as never,
    finish: (result: T, hints: EstimateHints) => T = ((r: T) => r) as never,
  ): Promise<T> {
    const apiKey = await this.options.getApiKey()
    if (!apiKey) throw new EstimateError('NO_KEY', 'No API key configured')

    const model = (await this.options.getModel())?.trim()
    if (!model) throw new EstimateError('PROVIDER', 'No model configured')
    this.model = model
    const doFetch = this.options.fetchImpl ?? fetch

    /**
     * Newer models (GPT-5.x, o-series) reject `max_tokens` and require
     * `max_completion_tokens`; older ones only know `max_tokens`. Since the
     * model is a free-text setting, we cannot know which we are talking to —
     * so we start with the modern spelling and fall back when the provider
     * tells us it is wrong. Same for JSON mode, which not every model exposes.
     */
    const shape = { tokenParam: 'max_completion_tokens' as 'max_completion_tokens' | 'max_tokens', jsonMode: true }

    const call = async (extraInstruction?: string) => {
      const conversation = followUpText(answers)
      const messages = [
        { role: 'system', content: systemPrompt + languageRule(hints.language) },
        { role: 'user', content: userContent },
        ...(conversation ? [{ role: 'user', content: conversation }] : []),
        ...(extraInstruction ? [{ role: 'user', content: extraInstruction }] : []),
      ]

      let response: Response
      try {
        response = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            ...(shape.jsonMode ? { response_format: { type: 'json_object' } } : {}),
            [shape.tokenParam]: MAX_COMPLETION_TOKENS,
          }),
        })
      } catch (cause) {
        // fetch rejects for anything that stopped the request reaching the
        // provider — genuinely offline, but also a blocked cross-origin call
        // or an extension eating the request. Telling someone with a working
        // connection that they are offline sends them debugging the wrong
        // thing, so the two are separated.
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        throw new EstimateError(
          offline ? 'OFFLINE' : 'BLOCKED',
          offline ? 'The device is offline' : 'The request never reached the provider',
          String(cause),
        )
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        if (response.status === 401 || response.status === 403) {
          throw new EstimateError('BAD_KEY', 'The provider rejected the API key', body)
        }
        if (response.status === 429) {
          throw new EstimateError('RATE_LIMIT', 'Rate limited by the provider', body)
        }

        // A 400 naming a parameter is the provider telling us this model wants
        // a different dialect. Adjust and retry rather than failing the user.
        if (response.status === 400) {
          if (shape.tokenParam === 'max_completion_tokens' && body.includes('max_completion_tokens')) {
            shape.tokenParam = 'max_tokens'
            return call(extraInstruction)
          }
          if (shape.jsonMode && body.includes('response_format')) {
            shape.jsonMode = false
            return call(extraInstruction)
          }
        }

        throw new EstimateError('PROVIDER', `Provider error ${response.status}`, body)
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new EstimateError('UNREADABLE', 'Empty reply from the model', payload)
      return content
    }

    const parse = (content: string): T => {
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw new EstimateError('UNREADABLE', 'Reply was not JSON', content)
      }
      return read(parsed, model)
    }

    let result: T
    try {
      result = parse(await call())
    } catch (error) {
      // One repair attempt, as specified — models usually comply when told
      // exactly what went wrong. A second failure is a real failure.
      if (!(error instanceof EstimateError) || error.kind !== 'UNREADABLE') throw error
      result = parse(
        await call('That was not valid JSON in the required shape. Reply with only the JSON object.'),
      )
    }

    return finish(result, hints)
  }
}

/** Cheapest possible call that proves a key works. Used by the Settings test button. */
export async function testApiKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const response = await fetchImpl('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (response.ok) return { ok: true }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'That key was rejected by the provider.' }
    }
    return { ok: false, reason: `Provider returned ${response.status}.` }
  } catch {
    return { ok: false, reason: 'Could not reach the provider — are you online?' }
  }
}

/**
 * Models available on the user's account.
 *
 * `/v1/models` reports ids but not capabilities, so vision support cannot be
 * detected — this filters out the families that are definitely not chat
 * (embeddings, audio, moderation, image generation) and leaves the judgement
 * to the user, who can see their own account's list. Better than a hardcoded
 * menu that goes stale every time the lineup changes.
 */
export interface ModelChoice {
  id: string
  /** False for models that cannot read an image, so the UI can stop you picking one. */
  vision: boolean
  /** Specialised variants that work but are a poor fit here (search, pro). */
  note?: string
}

export type ModelListResult =
  | { ok: true; models: ModelChoice[]; total: number }
  | { ok: false; reason: string }

// sora is video generation; the rest are not chat completions endpoints at all.
const NOT_CHAT =
  /embedding|whisper|tts|audio|realtime|moderation|dall-e|image|transcribe|codex|babbage|davinci|sora|veo/i

/**
 * Vision support is a naming heuristic, because `/v1/models` returns ids and
 * nothing else — no capability metadata at all.
 *
 * Known text-only: the whole 3.5 family, the ORIGINAL gpt-4 (vision arrived
 * with gpt-4-turbo), anything `-instruct` (a completions model, not a chat
 * one), and the earlier small reasoning models. The o-series is deliberately
 * enumerated rather than pattern-matched, because it is not consistent:
 * o1-mini and o3-mini cannot see, while o4-mini can.
 *
 * Wrong in the safe direction: a mislabelled model shows as unusable rather
 * than failing mid-analysis after you have taken the photo.
 */
export function looksVisionCapable(id: string): boolean {
  if (/^gpt-3\.5/i.test(id)) return false
  if (/instruct/i.test(id)) return false
  // `gpt-4`, `gpt-4-0613`, `gpt-4-0314` — but NOT gpt-4-turbo or gpt-4.1.
  if (/^gpt-4$/i.test(id) || /^gpt-4-\d{4}$/i.test(id)) return false
  // o1-mini and o3-mini are text-only; o4-mini and the full o-series are not.
  if (/^o[13]-mini/i.test(id)) return false
  return true
}

const noteFor = (id: string): string | undefined => {
  if (/search/i.test(id)) return 'tuned for web search'
  if (/-pro\b/i.test(id)) return 'slow and expensive'
  if (/chat-latest/i.test(id)) return 'a moving alias'
  return undefined
}

export async function listChatModels(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelListResult> {
  let response: Response
  try {
    response = await fetchImpl('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  } catch {
    return { ok: false, reason: 'Could not reach OpenAI to list your models.' }
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'Your key was rejected, so the model list could not be loaded.' }
  }
  if (!response.ok) {
    return { ok: false, reason: `OpenAI returned ${response.status} when listing models.` }
  }

  const payload = (await response.json().catch(() => null)) as { data?: { id: string }[] } | null
  if (!payload?.data) return { ok: false, reason: 'OpenAI returned an unexpected model list.' }

  const models = payload.data
    .map((model) => model.id)
    .filter((id) => !NOT_CHAT.test(id))
    // Newest-looking first: numeric compare puts 5.4 above 4o, descending.
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((id) => ({ id, vision: looksVisionCapable(id), note: noteFor(id) }))

  return { ok: true, models, total: payload.data.length }
}
