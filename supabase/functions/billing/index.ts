/**
 * The two doors to Lemon Squeezy: subscribe, and manage.
 *
 * `{ action: 'checkout' }` makes a hosted checkout tied to the caller's
 * account. The user id travels as checkout custom data and comes back on
 * every subscription webhook, which is how the subscription finds its
 * account. Refused for someone already subscribed, so nobody pays twice.
 *
 * `{ action: 'portal' }` returns the customer portal for the caller's newest
 * subscription. Lemon Squeezy signs that link for 24 hours, so it is fetched
 * fresh each time rather than stored.
 *
 * The API key lives here as a function secret; the browser only ever sees
 * the URLs.
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createCheckout, customerPortal } from '../_shared/lemonsqueezy.ts'
import { activePlan, type SubscriptionRow } from '../_shared/plan.ts'

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

/** Where the checkout sends the buyer back to. Settings knows to wait for the webhook. */
const appUrl = () => (Deno.env.get('APP_URL') ?? 'https://vimetry.app').replace(/\/$/, '')

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

  let body: { action?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: subs, error } = await admin
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
  if (error) return json({ error: 'ledger_unavailable' }, 503)
  const rows = (subs ?? []) as SubscriptionRow[]

  if (body?.action === 'checkout') {
    if (activePlan(rows, new Date())) return json({ error: 'already_subscribed' }, 409)
    const url = await createCheckout({
      userId: user.id,
      email: user.email ?? undefined,
      redirectUrl: `${appUrl()}/settings?billing=success`,
    })
    return url ? json({ url }) : json({ error: 'billing_unavailable' }, 502)
  }

  if (body?.action === 'portal') {
    const newest = [...rows].sort(
      (a, b) => Date.parse(b.source_created_at ?? '') - Date.parse(a.source_created_at ?? ''),
    )[0]
    if (!newest) return json({ error: 'no_subscription' }, 404)
    const url = await customerPortal(newest.id)
    return url ? json({ url }) : json({ error: 'billing_unavailable' }, 502)
  }

  return json({ error: 'bad_request' }, 400)
})
