/**
 * A Google Play subscription, translated into the row the rest of the app
 * already understands (`public.subscriptions`, `_shared/plan.ts`).
 *
 * One rule set for both sellers: Play's states are mapped onto the statuses
 * Lemon Squeezy uses, so `currentPeriod` decides access the same way for
 * both. Cancel → to the end of the paid month. A full refund → at once (the
 * caller sets `refunded_at` from a voided-purchase notification).
 *
 * Plain TypeScript with no imports, so Vitest tests it and Deno runs it.
 */

/** The parts of Play's SubscriptionPurchaseV2 this app reads. */
export interface PlayPurchase {
  subscriptionState?: string
  startTime?: string
  linkedPurchaseToken?: string
  acknowledgementState?: string
  lineItems?: {
    productId?: string
    expiryTime?: string
    autoRenewingPlan?: { autoRenewEnabled?: boolean }
  }[]
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string }
  /** Present (and empty) only for a license tester's purchase. */
  testPurchase?: Record<string, never>
}

/** Play's state, in Lemon Squeezy's words — which `plan.ts` already knows. */
const STATUS: Record<string, string> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  // Payment failed, Play is retrying, and the user keeps access meanwhile.
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'past_due',
  // Retrying, without access.
  SUBSCRIPTION_STATE_ON_HOLD: 'unpaid',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  // Will not renew; access to the end of the paid period.
  SUBSCRIPTION_STATE_CANCELED: 'cancelled',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  // Not paid yet (a slow payment method): no access until it is.
  SUBSCRIPTION_STATE_PENDING: 'pending',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
}

export function playStatus(state: string | undefined): string {
  // The v2 API spells them SUBSCRIPTION_STATE_ACTIVE; accept the bare form too.
  const key = state?.startsWith('SUBSCRIPTION_STATE_') ? state : `SUBSCRIPTION_STATE_${state ?? ''}`
  return STATUS[key] ?? 'unknown'
}

export interface PlayRow {
  id: string
  provider: 'google_play'
  status: string
  billing_anchor: number | null
  renews_at: string | null
  ends_at: string | null
  source_created_at: string | null
  linked_purchase_token: string | null
  test_mode: boolean
  variant_id: string | null
}

/** The row for a purchase token, from Play's own account of it. */
export function playRow(token: string, purchase: PlayPurchase): PlayRow {
  const status = playStatus(purchase.subscriptionState)
  const item = purchase.lineItems?.[0]
  const expiry = item?.expiryTime ?? null
  const start = purchase.startTime && !Number.isNaN(Date.parse(purchase.startTime)) ? purchase.startTime : null
  return {
    id: token,
    provider: 'google_play',
    status,
    // Play bills monthly from the day it was bought, as Lemon Squeezy does from its anchor.
    billing_anchor: start ? new Date(start).getUTCDate() : null,
    renews_at: status === 'active' || status === 'past_due' ? expiry : null,
    ends_at: status === 'cancelled' || status === 'expired' ? expiry : null,
    source_created_at: start,
    linked_purchase_token: purchase.linkedPurchaseToken ?? null,
    test_mode: purchase.testPurchase !== undefined,
    variant_id: item?.productId ?? null,
  }
}

/** Google Play's own page for managing a subscription — Play does cancelling and card changes. */
export function playManageUrl(packageName: string, productId: string): string {
  return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(packageName)}`
}
