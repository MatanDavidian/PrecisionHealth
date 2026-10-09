/**
 * Subscribing and managing a subscription: both are pages on Lemon Squeezy.
 *
 * The `billing` function makes the link — it holds the API key, and ties a
 * checkout to the signed-in account — and the browser simply goes there.
 * Card details never touch this app.
 */
import { getSupabaseClient, isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client'

export type BillingAction = 'checkout' | 'portal'

export type BillingLink =
  | { ok: true; url: string }
  | { ok: false; reason: 'not_signed_in' | 'already_subscribed' | 'unavailable' }

export async function billingLink(action: BillingAction): Promise<BillingLink> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'unavailable' }
  const client = await getSupabaseClient()
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, reason: 'not_signed_in' }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/billing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    })
    const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
    if (response.ok && typeof body.url === 'string' && body.url.startsWith('https://')) {
      return { ok: true, url: body.url }
    }
    if (body.error === 'already_subscribed') return { ok: false, reason: 'already_subscribed' }
    if (response.status === 401) return { ok: false, reason: 'not_signed_in' }
  } catch {
    // Offline, or the function unreachable: the same advice either way.
  }
  return { ok: false, reason: 'unavailable' }
}
