/**
 * How much free analysis is left.
 *
 * Read from the ledger the edge function writes, so the client and the server
 * are looking at the same rows — the UI can show "3 of 10 left" without
 * inventing a second count that could disagree with the one that actually
 * refuses.
 *
 * Advisory only. The server refuses; this just lets the app say so first.
 *
 * The count below matches outcome = 'OK' exactly, which is what makes a
 * conversation cost one analysis: follow-up rounds are written as
 * 'OK_FOLLOWUP' and fall outside the filter, so they are metered and costed
 * without being counted. Widening either match to a prefix would silently
 * start charging for answered questions.
 */
import { TRIAL_MODEL, TRIAL_ANALYSES } from '../../supabase/functions/_shared/prompt'
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client'
import type { UserId } from '@/domain'

export const TRIAL_ALLOWANCE = TRIAL_ANALYSES

export interface TrialStatus {
  used: number
  allowance: number
  remaining: number
  exhausted: boolean
  /** What the app should ask for next, absent an explicit choice. */
  suggestedModel: string
}

/**
 * The trial rules, as a pure function, so they can be tested without a
 * network or an account.
 */
export function computeTrialStatus(used: number): TrialStatus {
  return {
    used,
    allowance: TRIAL_ALLOWANCE,
    remaining: Math.max(0, TRIAL_ALLOWANCE - used),
    exhausted: used >= TRIAL_ALLOWANCE,
    // The best model, for every analysis; the faster one is a choice in Settings.
    suggestedModel: TRIAL_MODEL,
  }
}

export async function readTrialStatus(userId: UserId): Promise<TrialStatus | undefined> {
  if (!isSupabaseConfigured) return undefined
  const client = await getSupabaseClient()
  const { count, error } = await client
    .from('usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('key_source', 'MASTER_TRIAL')
    .eq('outcome', 'OK')

  /**
   * A ledger we cannot read means we do not know, and saying "10 free
   * analyses" on a guess would be a promise the server has not made. Returning
   * undefined leaves the app in its own-key mode, which works — rather than
   * offering something that then fails on first use.
   *
   * PGRST205 specifically means the migration has not been applied yet.
   */
  if (error) return undefined

  // `count` is null when the query could not actually count — treat that as
  // unknown rather than as zero, which would invent a full trial.
  if (count === null || count === undefined) return undefined
  return computeTrialStatus(count)
}
