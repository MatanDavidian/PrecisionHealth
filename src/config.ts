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
   * Chosen after comparing models on the same photo: against gpt-4o-mini it
   * found roughly twice as many items, separated dry pantry goods from cooked
   * portions, and gave calibrated rather than flat confidence.
   */
  model: 'gpt-5.6-sol',
  /** On, because it is what makes the photo flow two taps. */
  autoAnalyze: true,
}
