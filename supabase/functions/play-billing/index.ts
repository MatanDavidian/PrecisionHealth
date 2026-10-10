/**
 * The Android app reports a Google Play purchase here, right after it.
 *
 * `{ purchaseToken }` from the Payment Request API's response. The token is
 * only a claim until Play's own API confirms it, so this:
 * - reads the purchase from Play
 * - checks it is our product
 * - binds it to the caller (once — never to anyone else)
 * - refuses a second subscription (left unacknowledged, so Google refunds it)
 * - acknowledges it (Google refunds unacknowledged purchases after three days)
 * - stores it for the plan to read
 *
 * The app also calls this on every start for purchases Play still lists,
 * which finishes any that the app was closed in the middle of.
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getSubscription, playConfigured } from '../_shared/googlePlay.ts'
import { applyPurchase } from '../_shared/playSubscriptions.ts'

const CORS = {
  'x-vimetry-version': VERSION,
  'Access-Control-Expose-Headers': 'x-vimetry-version',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const STATUS: Record<string, [number, string]> = {
  NOT_YOURS: [403, 'not_yours'],
  WRONG_PRODUCT: [400, 'wrong_product'],
  ALREADY_SUBSCRIBED: [409, 'already_subscribed'],
  UNKNOWN_USER: [401, 'not_signed_in'],
  ACK_FAILED: [502, 'billing_unavailable'],
  LEDGER_UNAVAILABLE: [503, 'ledger_unavailable'],
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: userError } = await asCaller.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'not_signed_in' }, 401)

  let body: { purchaseToken?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const token = typeof body?.purchaseToken === 'string' ? body.purchaseToken : ''
  if (!token || token.length > 512 || /\s/.test(token)) return json({ error: 'bad_request' }, 400)
  if (!playConfigured()) return json({ error: 'billing_unavailable' }, 502)

  const lookup = await getSubscription(token)
  if (!lookup.ok) {
    return lookup.reason === 'not_found'
      ? json({ error: 'unknown_purchase' }, 404)
      : json({ error: 'billing_unavailable' }, 502)
  }

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { result } = await applyPurchase(admin, token, lookup.purchase, user.id)
  if (result === 'APPLIED') return json({ ok: true })
  const [status, error] = STATUS[result] ?? [500, 'server_error']
  return json({ error }, status)
})
