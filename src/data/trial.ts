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
 * Both counts below match outcome = 'OK' exactly, which is what makes a
 * conversation cost one analysis: follow-up rounds are written as
 * 'OK_FOLLOWUP' and fall outside the filter, so they are metered and costed
 * without being counted. Widening either match to a prefix would silently
 * start charging for answered questions.
 */
import {
  MODEL_SOL,
  MODEL_TERRA,
  TRIAL_ANALYSES,
  TRIAL_SOL_ANALYSES,
  TRIAL_SOL_NUDGE_AT,
} from '../../supabase/functions/_shared/prompt'
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client'
import type { UserId } from '@/domain'

export const TRIAL_ALLOWANCE = TRIAL_ANALYSES

export interface TrialStatus {
  used: number
  allowance: number
  remaining: number
  exhausted: boolean
  /** Analyses spent on the best model, which has its own smaller budget. */
  solUsed: number
  solAllowance: number
  solRemaining: number
  /** True once the app should have moved itself to the faster model. */
  pastNudge: boolean
  /** What the app should ask for next, absent an explicit choice. */
  suggestedModel: string
}

/**
 * The trial rules, as a pure function.
 *
 * Separated from the query so the interesting part — when the app moves itself
 * to a faster model, when the best one locks — can be tested without a network
 * or an account.
 */
export function computeTrialStatus(used: number, solUsed: number): TrialStatus {
  const solRemaining = Math.max(0, TRIAL_SOL_ANALYSES - solUsed)
  return {
    used,
    allowance: TRIAL_ALLOWANCE,
    remaining: Math.max(0, TRIAL_ALLOWANCE - used),
    exhausted: used >= TRIAL_ALLOWANCE,
    solUsed,
    solAllowance: TRIAL_SOL_ANALYSES,
    solRemaining,
    pastNudge: solUsed >= TRIAL_SOL_NUDGE_AT,
    /**
     * Opens on the best model, then moves itself to the faster one after a
     * couple of analyses — a default, not a lock. Sol stays available in
     * Settings until its budget is actually spent.
     */
    suggestedModel:
      solUsed < TRIAL_SOL_NUDGE_AT && solRemaining > 0 ? MODEL_SOL : MODEL_TERRA,
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
  const used = count

  const { count: solCount } = await client
    .from('usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('key_source', 'MASTER_TRIAL')
    .eq('outcome', 'OK')
    .eq('model', MODEL_SOL)
  const solUsed = solCount ?? 0
  return computeTrialStatus(used, solUsed)
}
