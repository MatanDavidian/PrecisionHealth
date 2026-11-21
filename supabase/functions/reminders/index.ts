/**
 * Reminders, for the signed-in person (docs/features/reminders.md):
 *
 * - `available`: whether reminders exist here at all (no sign-in needed)
 * - `key`: the public key a browser subscribes with
 * - `subscribe`: remember this device, for this account
 * - `unsubscribe`: forget it
 * - `test`: send "this is how a reminder will look" to every device now
 *
 * Whether reminders are on, and when, is the person's own row in
 * `user_preferences`, written by the app directly. This function holds
 * what a browser must not: the private key, and the list of devices.
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isPushEndpoint, isPushKeys } from '../_shared/webPush.ts'
import { reminderMessage } from '../_shared/reminderRules.ts'
import { deliver, pushKeys } from '../_shared/pushDelivery.ts'

const CORS = {
  'x-vimetry-version': VERSION,
  'Access-Control-Expose-Headers': 'x-vimetry-version',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Devices one person may have subscribed. Far above any real household, low enough to bound a loop. */
const MAX_DEVICES = 10

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  // Whether reminders exist here at all, asked before anyone signs in: the
  // app shows the feature only once this function is deployed. Says nothing else.
  if (body.action === 'available') return json({ available: true })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: userError } = await asCaller.auth.getUser()
  if (userError || !userData.user) return json({ error: 'not_signed_in' }, 401)
  const userId = userData.user.id
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    switch (body.action) {
      case 'key': {
        const keys = await pushKeys(admin, true)
        return json({ publicKey: keys!.publicKey })
      }

      case 'subscribe': {
        const subscription = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
        const endpoint = subscription?.endpoint
        const p256dh = subscription?.keys?.p256dh
        const auth = subscription?.keys?.auth
        if (!isPushEndpoint(endpoint) || !isPushKeys(p256dh, auth)) return json({ error: 'bad_subscription' }, 400)
        const { count } = await admin
          .from('push_subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .neq('endpoint', endpoint)
        if ((count ?? 0) >= MAX_DEVICES) return json({ error: 'too_many_devices', max: MAX_DEVICES }, 409)
        // A device belongs to whoever subscribed it last: signing in as
        // someone else on the same phone moves its reminders with it.
        const { error } = await admin
          .from('push_subscriptions')
          .upsert({ user_id: userId, endpoint, p256dh, auth }, { onConflict: 'endpoint' })
        if (error) throw new Error(error.message)
        return json({ ok: true })
      }

      case 'unsubscribe': {
        if (typeof body.endpoint !== 'string') return json({ error: 'bad_request' }, 400)
        await admin.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', body.endpoint)
        return json({ ok: true })
      }

      case 'test': {
        const keys = await pushKeys(admin, false)
        if (!keys) return json({ sent: 0, gone: 0, failed: 0 })
        const lang = body.lang === 'he' ? 'he' : 'en'
        // A test is worth nothing an hour later: it expires in ten minutes.
        return json(await deliver(admin, userId, reminderMessage('TEST', lang), keys, 600))
      }

      default:
        return json({ error: 'bad_request' }, 400)
    }
  } catch (cause) {
    console.error('reminders failed', cause instanceof Error ? cause.message : cause)
    return json({ error: 'unavailable' }, 503)
  }
})
