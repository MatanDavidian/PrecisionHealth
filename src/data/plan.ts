/**
 * The paid plan, as the app shows it.
 *
 * Read from the same two tables the server decides from — the subscription
 * the webhook wrote, and the ledger — through the same rules
 * (`_shared/plan.ts`), so the balance on screen is the one the server will
 * refuse at. Advisory, like the trial's count: the server is what refuses.
 */
import {
  PLAN_ALLOWANCE,
  activePlan,
  type AnalysisKind,
  type SubscriptionRow,
} from '../../supabase/functions/_shared/plan'
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client'
import type { UserId } from '@/domain'

export interface Allowance {
  used: number
  allowance: number
  remaining: number
}

export interface PlanStatus {
  status: string
  /** False once cancelled: `periodEnd` is then when access ends, not a reset. */
  renews: boolean
  periodEnd: string
  photos: Allowance
  texts: Allowance
}

export function allowanceOf(kind: AnalysisKind, used: number): Allowance {
  const allowance = PLAN_ALLOWANCE[kind]
  return { used, allowance, remaining: Math.max(0, allowance - used) }
}

/** Undefined when no subscription gives access now — or when that cannot be read. */
export async function readPlanStatus(userId: UserId): Promise<PlanStatus | undefined> {
  if (!isSupabaseConfigured) return undefined
  const client = await getSupabaseClient()
  const { data, error } = await client.from('subscriptions').select('*').eq('user_id', userId)
  // Before migration 0014, or the network: no plan is the safe reading — the
  // trial and an own key still work, and nothing is promised that may not hold.
  if (error || !data) return undefined
  const period = activePlan(data as SubscriptionRow[], new Date())
  if (!period) return undefined

  const count = async (kind: AnalysisKind) => {
    const { count } = await client
      .from('usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('key_source', 'MASTER_PLAN')
      .eq('outcome', 'OK')
      .eq('kind', kind)
      .gte('created_at', period.start)
    return count ?? 0
  }
  const [photos, texts] = await Promise.all([count('PHOTO'), count('TEXT')])
  return {
    status: period.status,
    renews: period.renews,
    periodEnd: period.end,
    photos: allowanceOf('PHOTO', photos),
    texts: allowanceOf('TEXT', texts),
  }
}
