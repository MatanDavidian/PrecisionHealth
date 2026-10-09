/**
 * The little of Lemon Squeezy's API this app uses.
 *
 * Configured by function secrets (docs/ops/payments.md):
 * - LEMONSQUEEZY_API_KEY: an API key from the store, test or live to match
 *   the mode below
 * - LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_VARIANT_ID: what a checkout sells
 * - LEMONSQUEEZY_WEBHOOK_SECRET: the signing secret set on the webhook
 * - LEMONSQUEEZY_TEST_MODE=1: while testing. Test-mode events are then the
 *   only ones applied, and live ones are ignored — and without it the
 *   reverse, so a test purchase can never grant real access after launch.
 */

const API = 'https://api.lemonsqueezy.com/v1'

export const testMode = () => Deno.env.get('LEMONSQUEEZY_TEST_MODE') === '1'

function headers(): HeadersInit | undefined {
  const key = Deno.env.get('LEMONSQUEEZY_API_KEY')
  if (!key) return undefined
  return {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Bearer ${key}`,
  }
}

/**
 * Cancels a subscription: no further charges, access to the end of the paid
 * month (Lemon Squeezy's own rule for a cancel). True when Lemon Squeezy
 * confirms it, or when there was nothing left to cancel.
 */
export async function cancelSubscription(id: string): Promise<boolean> {
  const auth = headers()
  if (!auth) return false
  try {
    const response = await fetch(`${API}/subscriptions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: auth,
    })
    // 404: already gone at Lemon Squeezy, which is the outcome wanted.
    return response.ok || response.status === 404
  } catch {
    return false
  }
}

/** A hosted checkout for the plan, tied to this user. Undefined if it could not be made. */
export async function createCheckout(options: {
  userId: string
  email?: string
  redirectUrl: string
}): Promise<string | undefined> {
  const auth = headers()
  const store = Deno.env.get('LEMONSQUEEZY_STORE_ID')
  const variant = Deno.env.get('LEMONSQUEEZY_VARIANT_ID')
  if (!auth || !store || !variant) return undefined
  try {
    const response = await fetch(`${API}/checkouts`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            // The webhook links the subscription to the account by this id —
            // never by email, which the buyer can change at checkout.
            checkout_data: {
              ...(options.email ? { email: options.email } : {}),
              custom: { user_id: options.userId },
            },
            product_options: { redirect_url: options.redirectUrl },
            test_mode: testMode(),
            // A link that leaks later is useless after an hour.
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          },
          relationships: {
            store: { data: { type: 'stores', id: store } },
            variant: { data: { type: 'variants', id: variant } },
          },
        },
      }),
    })
    if (!response.ok) return undefined
    const body = await response.json()
    const url = body?.data?.attributes?.url
    return typeof url === 'string' ? url : undefined
  } catch {
    return undefined
  }
}

/** The customer portal for a subscription: a signed link, valid for 24 hours. */
export async function customerPortal(subscriptionId: string): Promise<string | undefined> {
  const auth = headers()
  if (!auth) return undefined
  try {
    const response = await fetch(`${API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: auth,
    })
    if (!response.ok) return undefined
    const body = await response.json()
    const url = body?.data?.attributes?.urls?.customer_portal
    return typeof url === 'string' ? url : undefined
  } catch {
    return undefined
  }
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** HMAC-SHA256 of the raw body, hex — what Lemon Squeezy sends as X-Signature. */
export async function sign(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
}

/** Constant-time, so the comparison does not leak how much of a guess was right. */
export async function verifySignature(secret: string, raw: string, signature: string): Promise<boolean> {
  const expected = await sign(secret, raw)
  if (signature.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return difference === 0
}

export async function sha256(raw: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))
}
