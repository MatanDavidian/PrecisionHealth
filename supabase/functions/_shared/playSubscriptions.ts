/**
 * Storing a Google Play purchase against an account — shared by `play-billing`
 * (the app, right after buying) and `play-rtdn` (Google, on every change).
 *
 * The rules, the same as for Lemon Squeezy:
 * - One subscription per account, from either store. A second one is not
 *   acknowledged, so Google refunds it by itself within three days.
 * - A purchase belongs to one account. Inside the Android app Play cannot
 *   carry our account id, so a token is bound to the first account that
 *   verifies it, and refused to any other.
 * - State always comes from Play's API, never from a notification's word.
 */
// deno-lint-ignore-file no-explicit-any
import { activePlan, type SubscriptionRow } from './plan.ts'
import { playRow, type PlayPurchase } from './playState.ts'
import { acknowledge, productId } from './googlePlay.ts'

/** Postgres: a foreign key with nothing to point at — a deleted account. */
const FOREIGN_KEY_VIOLATION = '23503'

export type ApplyResult =
  | 'APPLIED'
  | 'NOT_YOURS'
  | 'WRONG_PRODUCT'
  | 'ALREADY_SUBSCRIBED'
  | 'UNKNOWN_USER'
  | 'UNLINKED'
  | 'ACK_FAILED'
  | 'LEDGER_UNAVAILABLE'

/**
 * Who a purchase belongs to: the account already holding the token, the one
 * Play names, or the one holding the token it replaced — else `claimant`.
 */
async function ownerOf(admin: any, token: string, purchase: PlayPurchase, claimant?: string) {
  const { data: held, error } = await admin.from('subscriptions').select('user_id').eq('id', token).maybeSingle()
  if (error) return { error: true as const }
  const named = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId
  let previous: string | undefined
  if (purchase.linkedPurchaseToken) {
    const { data } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('id', purchase.linkedPurchaseToken)
      .maybeSingle()
    previous = data?.user_id
  }
  const known = held?.user_id ?? named ?? previous
  if (known && claimant && known !== claimant) return { owner: undefined, conflict: true as const }
  return { owner: known ?? claimant }
}

export async function applyPurchase(
  admin: any,
  token: string,
  purchase: PlayPurchase,
  claimant?: string,
): Promise<{ result: ApplyResult; userId?: string }> {
  const item = purchase.lineItems?.[0]
  if (item?.productId !== productId()) return { result: 'WRONG_PRODUCT' }

  const who = await ownerOf(admin, token, purchase, claimant)
  if ('error' in who) return { result: 'LEDGER_UNAVAILABLE' }
  if ('conflict' in who) return { result: 'NOT_YOURS' }
  if (!who.owner) return { result: 'UNLINKED' }
  const userId = who.owner

  const row = playRow(token, purchase)

  // One plan per account: any OTHER subscription that gives access wins.
  const { data: theirs, error: listError } = await admin.from('subscriptions').select('*').eq('user_id', userId)
  if (listError) return { result: 'LEDGER_UNAVAILABLE' }
  const others = ((theirs ?? []) as SubscriptionRow[]).filter(
    (s) => s.id !== token && s.id !== purchase.linkedPurchaseToken,
  )
  const unacknowledged = purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING'
  if (unacknowledged && activePlan(others, new Date())) return { result: 'ALREADY_SUBSCRIBED', userId }

  const { error: writeError } = await admin.from('subscriptions').upsert({
    ...row,
    user_id: userId,
    source_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (writeError?.code === FOREIGN_KEY_VIOLATION) return { result: 'UNKNOWN_USER' }
  if (writeError) return { result: 'LEDGER_UNAVAILABLE' }

  // The token this one replaced (a re-subscription) stops counting.
  if (purchase.linkedPurchaseToken) {
    await admin
      .from('subscriptions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', purchase.linkedPurchaseToken)
      .eq('user_id', userId)
  }

  if (unacknowledged && row.status !== 'pending' && !(await acknowledge(token))) {
    return { result: 'ACK_FAILED', userId }
  }
  return { result: 'APPLIED', userId }
}
