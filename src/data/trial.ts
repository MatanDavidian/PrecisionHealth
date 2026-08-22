/**
 * How much free analysis is left.
 *
 * Read from the ledger the edge function writes, so the client and the server
 * are looking at the same rows — the UI can show "3 of 10 left" without
 * inventing a second count that could disagree with the one that actually
 * refuses.
 *
 * Advisory only. The server refuses; this just lets the app say so first.
 */
import { TRIAL_ANALYSES } from '../../supabase/functions/_shared/prompt'
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client'
import type { UserId } from '@/domain'

export const TRIAL_ALLOWANCE = TRIAL_ANALYSES

export interface TrialStatus {
  used: number
  allowance: number
  remaining: number
  exhausted: boolean
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
  const used = count
  return {
    used,
    allowance: TRIAL_ALLOWANCE,
    remaining: Math.max(0, TRIAL_ALLOWANCE - used),
    exhausted: used >= TRIAL_ALLOWANCE,
  }
}
