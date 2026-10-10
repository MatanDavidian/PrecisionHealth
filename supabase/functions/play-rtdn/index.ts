/**
 * Google Play's real-time developer notifications, via a Pub/Sub push.
 *
 * Deployed with `--no-verify-jwt`: the caller is Google's Pub/Sub, not a
 * user. The push URL carries a secret (`?token=`, GOOGLE_PLAY_RTDN_TOKEN),
 * compared in constant time. And nothing here trusts a notification's word:
 * - A subscription notification carries only a token, and the state is
 *   always re-read from Play's API (Google's own instruction).
 * - A refund (voided purchase) is believed only when Play's voided-purchases
 *   list confirms it.
 *
 * Pub/Sub delivers at least once and retries anything but a 2xx. So a
 * redelivered message is recognised by its id, and every outcome worth
 * retrying (Google or the database unreachable) answers 503.
 *
 * The rules, as for Lemon Squeezy:
 * - cancel: access to the end of the paid period
 * - a full refund: access ends at once, and renewal stops
 * - an account that no longer exists: its subscription is cancelled
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cancel, getSubscription, isVoided, packageName } from '../_shared/googlePlay.ts'
import { sha256 } from '../_shared/lemonsqueezy.ts'
import { applyPurchase } from '../_shared/playSubscriptions.ts'
import { STILL_CHARGING } from '../_shared/plan.ts'
import { playStatus } from '../_shared/playState.ts'

const HEADERS = { 'x-vimetry-version': VERSION, 'Access-Control-Expose-Headers': 'x-vimetry-version' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json' } })

/** SubscriptionNotification.notificationType, for the log. */
const TYPES: Record<number, string> = {
  1: 'RECOVERED', 2: 'RENEWED', 3: 'CANCELED', 4: 'PURCHASED', 5: 'ON_HOLD', 6: 'IN_GRACE_PERIOD',
  7: 'RESTARTED', 9: 'DEFERRED', 10: 'PAUSED', 11: 'PAUSE_SCHEDULE_CHANGED', 12: 'REVOKED',
  13: 'EXPIRED', 20: 'PENDING_PURCHASE_CANCELED',
}

function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let difference = a.length ^ b.length
  for (let i = 0; i < b.length; i++) difference |= (a[i] ?? 0) ^ b[i]
  return difference === 0
}

interface Notification {
  packageName?: string
  eventTimeMillis?: string | number
  subscriptionNotification?: { notificationType?: number; purchaseToken?: string }
  voidedPurchaseNotification?: { purchaseToken?: string; productType?: number; refundType?: number }
  testNotification?: unknown
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const expected = Deno.env.get('GOOGLE_PLAY_RTDN_TOKEN')
  if (!expected) return json({ error: 'not_configured' }, 500)
  if (!sameSecret(new URL(request.url).searchParams.get('token') ?? '', expected)) {
    return json({ error: 'unauthorized' }, 401)
  }

  let envelope: { message?: { data?: string; messageId?: string } }
  let notification: Notification
  try {
    envelope = await request.json()
    notification = JSON.parse(atob(envelope.message?.data ?? ''))
  } catch {
    // Malformed: retrying will not fix it, so acknowledge rather than loop.
    return json({ result: 'MALFORMED' })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const id = await sha256(`play:${envelope.message?.messageId ?? JSON.stringify(notification)}`)
  const { data: seen, error: seenError } = await admin.from('billing_events').select('id').eq('id', id).maybeSingle()
  if (seenError) return json({ error: 'ledger_unavailable' }, 503)
  if (seen) return json({ result: 'DUPLICATE' })

  const token = notification.subscriptionNotification?.purchaseToken ??
    notification.voidedPurchaseNotification?.purchaseToken
  const kind = notification.subscriptionNotification
    ? `play_${TYPES[notification.subscriptionNotification.notificationType ?? 0] ?? 'SUBSCRIPTION'}`.toLowerCase()
    : notification.voidedPurchaseNotification ? 'play_voided' : notification.testNotification ? 'play_test' : 'play_other'

  /** Logged once fully applied; a 5xx is left unlogged so the retry runs again. */
  const done = async (result: string, status = 200) => {
    if (status < 500) {
      await admin.from('billing_events').insert({
        id,
        event_name: kind,
        object_type: 'google_play',
        // Enough to find it again; the whole token is a credential of sorts.
        object_id: token ? token.slice(0, 24) : null,
        test_mode: null,
        result,
      })
    }
    return json({ result }, status)
  }

  if (notification.packageName !== packageName()) return done('IGNORED_PACKAGE')
  if (notification.testNotification) return done('TEST')
  if (!token) return done('IGNORED')

  // ------------------------------------------------------------- a refund --
  if (notification.voidedPurchaseNotification) {
    const v = notification.voidedPurchaseNotification
    if (v.productType !== 1 || v.refundType !== 1) return done('IGNORED') // not a full subscription refund
    const at = Number(notification.eventTimeMillis) || Date.now()
    const confirmed = await isVoided(token, at - 24 * 60 * 60 * 1000)
    if (confirmed === undefined) return done('PLAY_UNAVAILABLE', 503)
    if (!confirmed) return done('UNCONFIRMED')
    const { data: sub, error } = await admin.from('subscriptions').select('id, status').eq('id', token).maybeSingle()
    if (error) return done('LEDGER_UNAVAILABLE', 503)
    if (!sub) return done('NO_SUBSCRIPTION')
    const { error: writeError } = await admin
      .from('subscriptions')
      .update({ refunded_at: new Date(at).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', token)
    if (writeError) return done('LEDGER_UNAVAILABLE', 503)
    if (STILL_CHARGING.has(sub.status) && !(await cancel(token))) return done('REFUNDED_CANCEL_FAILED', 502)
    return done('REFUNDED')
  }

  // ------------------------------------------------------- any other change --
  const lookup = await getSubscription(token)
  if (!lookup.ok) return lookup.reason === 'not_found' ? done('UNKNOWN_PURCHASE') : done('PLAY_UNAVAILABLE', 503)

  const { result } = await applyPurchase(admin, token, lookup.purchase)
  if (result === 'LEDGER_UNAVAILABLE' || result === 'ACK_FAILED') return done(result, 503)
  if (result === 'UNKNOWN_USER') {
    // Paid for an account that is gone: stop the charges.
    const charging = STILL_CHARGING.has(playStatus(lookup.purchase.subscriptionState))
    if (charging && !(await cancel(token))) return done('UNKNOWN_USER_CANCEL_FAILED', 502)
  }
  return done(result)
})
