import type { Page } from '@playwright/test'

/**
 * OpenAI's model list, answered locally.
 *
 * The own-key path in Settings — test the key, load the account's models — is
 * the one part of the app that talks to OpenAI from the browser, and it was
 * the last thing in E2 with no coverage for exactly that reason: a test could
 * not exercise it without a real key and a real bill.
 *
 * Same discipline as `supabase.ts`: the seam is the network, so `testApiKey`
 * and `listChatModels` really run — the header, the status handling, the
 * filtering and the vision heuristic are all the app's own.
 */

/**
 * A believable account list, chosen to land in every branch of the UI.
 *
 * Three that can read a photo (one of them a search variant, which the app
 * annotates), three that cannot for three different reasons — the 3.5 family,
 * the original `gpt-4` before vision existed, and `o3-mini`, which is text-only
 * while `o4-mini` is not — and three that are not chat models at all and should
 * never reach the menu.
 */
const MODELS = [
  'gpt-5.6',
  'gpt-4o',
  'gpt-4o-mini-search-preview',
  'gpt-3.5-turbo',
  'gpt-4',
  'o3-mini',
  'text-embedding-3-large',
  'whisper-1',
  'dall-e-3',
]

export const VISION_MODELS = ['gpt-5.6', 'gpt-4o', 'gpt-4o-mini-search-preview']
export const TEXT_ONLY_MODELS = ['gpt-3.5-turbo', 'gpt-4', 'o3-mini']
/** What the app should report: chat models only, so the three above are gone. */
export const CHAT_MODEL_COUNT = VISION_MODELS.length + TEXT_ONLY_MODELS.length

export type OpenAiMood = 'ok' | 'rejected' | 'server-error' | 'offline' | 'nonsense'

export async function stubOpenAi(page: Page, mood: OpenAiMood = 'ok') {
  await page.route('https://api.openai.com/**', (route) => {
    if (mood === 'offline') return route.abort('connectionfailed')

    const reply = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      })

    if (mood === 'rejected') {
      return reply(401, { error: { message: 'Incorrect API key provided.' } })
    }
    if (mood === 'server-error') return reply(500, { error: { message: 'server_error' } })
    // A 200 whose shape is wrong is its own case: the app must not treat a
    // successful request as a successful answer.
    if (mood === 'nonsense') return reply(200, { object: 'list' })

    return reply(200, {
      object: 'list',
      data: MODELS.map((id) => ({ id, object: 'model', owned_by: 'openai' })),
    })
  })
}
