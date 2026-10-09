/**
 * Lemon Squeezy tells us about subscriptions here.
 *
 * Deployed with `--no-verify-jwt`: the caller is Lemon Squeezy, not a user.
 * What proves that instead is the signature — an HMAC of the raw body with a
 * secret only the two of us hold. Nothing is read from a body that fails it.
 *
 * The rules, as the owner decided them (2026-10-09):
 * - cancel: access to the end of the paid month (`ends_at`)
 * - a FULL refund: access ends at once, and the subscription is cancelled so
 *   it is not charged again
 * - an account that no longer exists: its subscription is cancelled
 *
 * Webhooks arrive late, twice, and out of order, so:
 * - a redelivered body is recognised by its hash and skipped
 * - a subscription event older than the stored one (`updated_at`) is ignored
 * - payment and refund dates only ever move forward
 * - an invoice for a subscription not yet seen is answered 503, so Lemon
 *   Squeezy retries it after `subscription_created` has landed
 *
 * Everything handled, even "ignored", answers 200; a 5xx means "retry".
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cancelSubscription, sha256, testMode, verifySignature } from '../_shared/lemonsqueezy.ts'
import { STILL_CHARGING } from '../_shared/plan.ts'

const HEADERS = {
  'x-vimetry-version': VERSION,
  'Access-Control-Expose-Headers': 'x-vimetry-version',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
  })

/** Postgres: a foreign key with nothing to point at — here, a deleted account. */
const FOREIGN_KEY_VIOLATION = '23503'

interface Event {
  meta?: { event_name?: string; test_mode?: boolean; custom_data?: { user_id?: unknown } }
  data?: { type?: string; id?: string | number; attributes?: Record<string, unknown> }
}

const text = (value: unknown) => (value === null || value === undefined ? null : String(value))
const later = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: HEADERS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const secret = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'not_configured' }, 500)

  const raw = await request.text()
  const signature = request.headers.get('x-signature') ?? ''
  if (!(await verifySignature(secret, raw, signature))) return json({ error: 'bad_signature' }, 401)

  let event: Event
  try {
    event = JSON.parse(raw)
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const name = event.meta?.event_name ?? ''
  const type = event.data?.type ?? ''
  const objectId = text(event.data?.id)
  const attributes = event.data?.attributes ?? {}
  const eventTestMode = Boolean(event.meta?.test_mode ?? attributes.test_mode)
  if (!name || !objectId) return json({ error: 'bad_request' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const id = await sha256(raw)

  const { data: seen, error: seenError } = await admin
    .from('billing_events')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (seenError) return json({ error: 'ledger_unavailable' }, 503)
  if (seen) return json({ result: 'DUPLICATE' })

  /** Written only once the event is fully applied, so a failure is retried rather than remembered. */
  const done = async (result: string, status = 200) => {
    if (status < 500) {
      await admin.from('billing_events').insert({
        id,
        event_name: name,
        object_type: type,
        object_id: objectId,
        test_mode: eventTestMode,
        result,
      })
    }
    return json({ result }, status)
  }

  if (eventTestMode !== testMode()) return done('IGNORED_MODE')

  const customUser = text(event.meta?.custom_data?.user_id)

  // ------------------------------------------------------- a subscription --
  if (type === 'subscriptions') {
    const { data: existing, error } = await admin
      .from('subscriptions')
      .select('user_id, source_updated_at')
      .eq('id', objectId)
      .maybeSingle()
    if (error) return done('LEDGER_UNAVAILABLE', 503)

    const updatedAt = text(attributes.updated_at)
    if (existing?.source_updated_at && updatedAt &&
      Date.parse(updatedAt) < Date.parse(existing.source_updated_at)) {
      return done('STALE')
    }

    const userId = existing?.user_id ?? customUser
    const status = text(attributes.status) ?? 'unknown'
    if (!userId) return done('UNLINKED')

    const { error: writeError } = await admin.from('subscriptions').upsert({
      id: objectId,
      user_id: userId,
      status,
      variant_id: text(attributes.variant_id),
      customer_id: text(attributes.customer_id),
      order_id: text(attributes.order_id),
      billing_anchor: typeof attributes.billing_anchor === 'number' ? attributes.billing_anchor : null,
      renews_at: text(attributes.renews_at),
      ends_at: text(attributes.ends_at),
      test_mode: eventTestMode,
      source_created_at: text(attributes.created_at),
      source_updated_at: updatedAt,
      updated_at: new Date().toISOString(),
    })
    if (writeError?.code === FOREIGN_KEY_VIOLATION) {
      /*
        Paid for an account that does not exist — deleted in another tab
        between checkout and payment, say. Nobody can use it, so stop it
        charging. Refunding is the owner's call; the event log says it happened.
      */
      if (STILL_CHARGING.has(status) && !(await cancelSubscription(objectId))) {
        return done('UNKNOWN_USER_CANCEL_FAILED', 502)
      }
      return done('UNKNOWN_USER')
    }
    if (writeError) return done('LEDGER_UNAVAILABLE', 503)
    return done('APPLIED')
  }

  // ------------------------------------------------- a payment or refund --
  if (type === 'subscription-invoices' || type === 'orders') {
    const column = type === 'orders' ? 'order_id' : 'id'
    const key = type === 'orders' ? objectId : text(attributes.subscription_id)
    if (!key) return done('IGNORED')

    const { data: sub, error } = await admin
      .from('subscriptions')
      .select('id, status, refunded_at, last_payment_at')
      .eq(column, key)
      .maybeSingle()
    if (error) return done('LEDGER_UNAVAILABLE', 503)
    if (!sub) {
      // An order refunded that was never a subscription is not ours to act on.
      if (type === 'orders') return done('NO_SUBSCRIPTION')
      // The invoice outran `subscription_created`: ask to be sent again.
      return done('SUBSCRIPTION_NOT_YET_KNOWN', 503)
    }

    const fullRefund = attributes.refunded === true
    const paid = attributes.status === 'paid' && name === 'subscription_payment_success'

    if (fullRefund) {
      const refundedAt = text(attributes.refunded_at) ?? new Date().toISOString()
      const { error: writeError } = await admin
        .from('subscriptions')
        .update({ refunded_at: later(sub.refunded_at, refundedAt), updated_at: new Date().toISOString() })
        .eq('id', sub.id)
      if (writeError) return done('LEDGER_UNAVAILABLE', 503)
      // Refunded and still charging would be the worst of both.
      if (STILL_CHARGING.has(sub.status) && !(await cancelSubscription(sub.id))) {
        return done('REFUNDED_CANCEL_FAILED', 502)
      }
      return done('REFUNDED')
    }

    if (paid) {
      const paidAt = text(attributes.created_at) ?? new Date().toISOString()
      const { error: writeError } = await admin
        .from('subscriptions')
        .update({ last_payment_at: later(sub.last_payment_at, paidAt), updated_at: new Date().toISOString() })
        .eq('id', sub.id)
      if (writeError) return done('LEDGER_UNAVAILABLE', 503)
      return done('PAID')
    }

    // A partial refund, a failed payment: the subscription events carry what matters.
    return done('IGNORED')
  }

  return done('IGNORED')
})
