/**
 * The paid plan: what it includes, and who has it right now.
 *
 * Shared by the server, which enforces it, and the app, which shows it — the
 * same rules in one place, so "37 of 100 left" on screen is the number the
 * server will actually refuse at. Plain TypeScript with no imports, so both
 * Deno and Vite can load it.
 *
 * Decided 2026-10-09 (docs/ops/payments.md):
 * - US$8.99 a month
 * - 100 photo analyses and 200 written ones a month, on either offered model
 * - cancelling keeps access to the end of the paid month
 * - a full refund ends access at once
 */

/** A photo of food (or of what is left of it), or anything written: a description, a leftover in words, a week's insights. */
export type AnalysisKind = 'PHOTO' | 'TEXT'

export const PLAN_ALLOWANCE: Record<AnalysisKind, number> = {
  /*
    Three or four meals a day. At GPT-6.1 Sol's measured cost — about 1.6¢ an
    ordinary plate, perhaps 4¢ a crowded one — the whole allowance costs
    $1.60–$4, against $7.99 net of Lemon Squeezy's fees.
  */
  PHOTO: 100,
  /*
    Separate, and larger, because writing costs a third of a photo (about
    0.65¢ on Sol) and someone who describes every meal needs ~120. Insights
    and written leftovers draw from it too.
  */
  TEXT: 200,
}

/** Shown in the app. The real price is whatever Lemon Squeezy charges; keep them equal. */
export const PLAN_PRICE = 'US$8.99'
export const PLAN_NAME = 'Vimetry Monthly'

/**
 * A subscription as the webhook stores it (`public.subscriptions`).
 *
 * Only what entitlement needs. No name, email or card: Lemon Squeezy holds
 * those, as the Privacy Policy says.
 */
export interface SubscriptionRow {
  id: string
  user_id: string
  /** Lemon Squeezy's own: on_trial, active, paused, past_due, unpaid, cancelled, expired. */
  status: string
  /** Day of the month Lemon Squeezy charges on. */
  billing_anchor: number | null
  renews_at: string | null
  /** Set once cancelled: the end of the month already paid for. */
  ends_at: string | null
  /** The latest FULL refund. Partial refunds are goodwill and change nothing. */
  refunded_at: string | null
  /** The latest successful payment, so a payment after a refund restores access. */
  last_payment_at: string | null
  source_created_at: string | null
  test_mode?: boolean
}

/**
 * Statuses in which Lemon Squeezy will still charge the card. What has to be
 * cancelled when an account is deleted, or a payment refunded.
 */
export const STILL_CHARGING = new Set(['active', 'on_trial', 'past_due', 'paused', 'unpaid'])

/** Paying, or being retried after a failed payment (four tries over two weeks). */
const RENEWING = new Set(['active', 'on_trial', 'past_due'])

export interface PlanPeriod {
  subscriptionId: string
  status: string
  /** Where this month's allowance is counted from. */
  start: string
  /** When the allowance resets — or, once cancelled, when access ends. */
  end: string
  /** False once cancelled: `end` is then the last day of access, not a reset. */
  renews: boolean
}

/** Refunded, and not paid for since. */
export function refunded(sub: SubscriptionRow): boolean {
  if (!sub.refunded_at) return false
  return !sub.last_payment_at || Date.parse(sub.last_payment_at) <= Date.parse(sub.refunded_at)
}

/**
 * The billing month that contains `now`, or undefined when this subscription
 * gives no access.
 *
 * Months run from the anchor day to the anchor day, at midnight UTC, the way
 * Lemon Squeezy bills. Counted from the anchor rather than from `renews_at`,
 * because `renews_at` moves to the next RETRY date while a payment is failing —
 * following it would shift the month and hand out a fresh allowance.
 */
export function currentPeriod(sub: SubscriptionRow, now: Date): PlanPeriod | undefined {
  if (refunded(sub)) return undefined
  const cancelled = sub.status === 'cancelled'
  if (!RENEWING.has(sub.status) && !cancelled) return undefined
  if (cancelled && (!sub.ends_at || now.getTime() >= Date.parse(sub.ends_at))) return undefined

  const anchor = sub.billing_anchor ?? anchorFrom(sub.source_created_at) ?? anchorFrom(sub.renews_at)
  if (!anchor) return undefined
  const { start, end } = monthAround(anchor, now)
  const endsAt = cancelled ? new Date(Math.min(end.getTime(), Date.parse(sub.ends_at!))) : end
  return {
    subscriptionId: sub.id,
    status: sub.status,
    start: start.toISOString(),
    end: endsAt.toISOString(),
    renews: !cancelled,
  }
}

/** The one subscription that counts: any that gives access, newest first. */
export function activePlan(subs: SubscriptionRow[], now: Date): PlanPeriod | undefined {
  const newestFirst = [...subs].sort(
    (a, b) => Date.parse(b.source_created_at ?? '') - Date.parse(a.source_created_at ?? ''),
  )
  for (const sub of newestFirst) {
    const period = currentPeriod(sub, now)
    if (period) return period
  }
  return undefined
}

function anchorFrom(iso: string | null): number | undefined {
  if (!iso || Number.isNaN(Date.parse(iso))) return undefined
  return new Date(iso).getUTCDate()
}

/** That anchor day in a given month, clamped: the 31st is the 30th in April and the 28th in February. */
function anchorIn(year: number, month: number, anchor: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(anchor, lastDay)))
}

export function monthAround(anchor: number, now: Date): { start: Date; end: Date } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const thisMonth = anchorIn(year, month, anchor)
  return now.getTime() >= thisMonth.getTime()
    ? { start: thisMonth, end: anchorIn(year, month + 1, anchor) }
    : { start: anchorIn(year, month - 1, anchor), end: thisMonth }
}
