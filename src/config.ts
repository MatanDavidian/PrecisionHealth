/**
 * App-level defaults.
 *
 * A leaf module: it imports nothing, and both `data` and `ui` may import it.
 * It exists so the storage layer does not have to reach into the OpenAI
 * adapter for a default model — storage should know nothing about AI vendors,
 * and a Supabase adapter would otherwise inherit that import.
 */
import type { AppSettings } from '@/data/repositories'

export const DEFAULT_SETTINGS: AppSettings = {
  /**
   * For someone on their own key: the app's own default, GPT-6.1 Sol, since
   * the gpt-5.6 models were retired from the app (2026-10-09).
   */
  model: 'gpt-6.1-sol',
  /** On, because it is what makes the photo flow two taps. */
  autoAnalyze: true,
}
