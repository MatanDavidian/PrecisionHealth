/**
 * Preferences that follow the person between devices.
 *
 * Queried directly rather than through the repository ports, for the same
 * reason `trial.ts` is: this is account metadata, not a health record. It has
 * no versions to fold, no provenance to weigh and no conflicts to surface, so
 * routing it through an interface built for all three would be ceremony.
 *
 * The device keeps its own copy in settings regardless. That is what makes the
 * app work signed out, work offline, and change language the instant you tap
 * rather than after a round trip.
 */
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client'
import type { Lang } from '@/ui/i18n/strings'
import type { UserId } from '@/domain'

const isLang = (value: unknown): value is Lang => value === 'en' || value === 'he'

/**
 * What the account says about language.
 *
 * Three states, not two, and the third is the point: "we could not ask" is not
 * "they have not chosen". Collapsing them into `undefined` would either nag
 * on every flaky connection or never ask at all, so the ambiguity is resolved
 * here in one round trip rather than by a second query.
 */
export type AccountLanguage =
  | { known: true; language?: Lang }
  | { known: false }

const UNKNOWN: AccountLanguage = { known: false }

export async function readAccountLanguage(userId: UserId): Promise<AccountLanguage> {
  // No project configured: there is no account to disagree with, so the device
  // is authoritative and nothing is pending.
  if (!isSupabaseConfigured) return { known: true }
  try {
    const client = await getSupabaseClient()
    const { data, error } = await client
      .from('user_preferences')
      .select('language')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return UNKNOWN
    const language = (data as { language?: unknown } | null)?.language
    return { known: true, language: isLang(language) ? language : undefined }
  } catch {
    return UNKNOWN
  }
}

/**
 * Records the choice against the account.
 *
 * Best-effort on purpose: the device has already changed language by the time
 * this runs, and failing to reach the server is not a reason to undo that or
 * to interrupt anyone. It will be written again the next time they choose.
 */
export async function saveAccountLanguage(userId: UserId, language: Lang): Promise<void> {
  if (!isSupabaseConfigured) return
  try {
    const client = await getSupabaseClient()
    await client
      .from('user_preferences')
      .upsert({ user_id: userId, language, updated_at: new Date().toISOString() })
  } catch {
    // Nothing to do and nothing to say: the app is already in the right
    // language, and this is a preference rather than a record.
  }
}
