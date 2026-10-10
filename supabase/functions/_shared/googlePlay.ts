/**
 * The little of the Google Play Developer API this app uses.
 *
 * Configured by function secrets (docs/ANDROID-APP.md, step 4):
 * - GOOGLE_PLAY_SERVICE_ACCOUNT: the service account's JSON key, as one
 *   string. Invited in Play Console → Users and permissions, with access to
 *   orders and subscriptions.
 * - GOOGLE_PLAY_PACKAGE: the app's package name (default app.vimetry)
 * - GOOGLE_PLAY_PRODUCT: the subscription's product id (default vimetry_monthly)
 * - GOOGLE_PLAY_RTDN_TOKEN: the secret on the Pub/Sub push URL (play-rtdn)
 *
 * Signs in as the service account itself (a JWT signed with its key,
 * exchanged for an access token), so no Google library is needed in Deno.
 */
import type { PlayPurchase } from './playState.ts'

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

export const packageName = () => Deno.env.get('GOOGLE_PLAY_PACKAGE') ?? 'app.vimetry'
export const productId = () => Deno.env.get('GOOGLE_PLAY_PRODUCT') ?? 'vimetry_monthly'
export const playConfigured = () => Boolean(Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT'))

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

let cached: { token: string; until: number; key: string } | undefined

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const text64 = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)))

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0)).buffer as ArrayBuffer
}

/** An access token for the Play API, reused until shortly before it expires. */
async function accessToken(): Promise<string | undefined> {
  const raw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT')
  if (!raw) return undefined
  if (cached && cached.key === raw && cached.until > Date.now()) return cached.token
  let account: ServiceAccount
  try {
    account = JSON.parse(raw)
  } catch {
    return undefined
  }
  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${text64({ alg: 'RS256', typ: 'JWT' })}.${text64({
    iss: account.client_email,
    scope: SCOPE,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(account.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = new Uint8Array(
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
    )
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${base64url(signature)}`,
      }),
    })
    if (!response.ok) return undefined
    const body = await response.json()
    if (typeof body.access_token !== 'string') return undefined
    cached = { token: body.access_token, until: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000, key: raw }
    return cached.token
  } catch {
    return undefined
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response | undefined> {
  const token = await accessToken()
  if (!token) return undefined
  try {
    return await fetch(`${API}/${encodeURIComponent(packageName())}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    })
  } catch {
    return undefined
  }
}

export type Lookup =
  | { ok: true; purchase: PlayPurchase }
  /** Play says no such purchase: forged, or for another app. */
  | { ok: false; reason: 'not_found' }
  /** Not configured, or Google unreachable: try again later, decide nothing. */
  | { ok: false; reason: 'unavailable' }

/** Play's own account of a purchase token (purchases.subscriptionsv2.get). */
export async function getSubscription(token: string): Promise<Lookup> {
  const response = await call(`/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`)
  if (!response) return { ok: false, reason: 'unavailable' }
  if (response.status === 404 || response.status === 410 || response.status === 400) {
    await response.body?.cancel()
    return { ok: false, reason: 'not_found' }
  }
  if (!response.ok) {
    await response.body?.cancel()
    return { ok: false, reason: 'unavailable' }
  }
  return { ok: true, purchase: await response.json() }
}

/**
 * Tells Play the purchase was received. Unacknowledged purchases are refunded
 * automatically after three days — which is also how a purchase this app
 * refuses (a second subscription) gets its money back.
 */
export async function acknowledge(token: string): Promise<boolean> {
  const response = await call(
    `/purchases/subscriptions/${encodeURIComponent(productId())}/tokens/${encodeURIComponent(token)}:acknowledge`,
    { method: 'POST', body: '{}' },
  )
  await response?.body?.cancel()
  return Boolean(response?.ok)
}

/** Stops renewal; access continues to the end of the paid period, as Play does it. */
export async function cancel(token: string): Promise<boolean> {
  const response = await call(
    `/purchases/subscriptions/${encodeURIComponent(productId())}/tokens/${encodeURIComponent(token)}:cancel`,
    { method: 'POST', body: '{}' },
  )
  await response?.body?.cancel()
  // 410: already gone at Google, which is the outcome wanted.
  return Boolean(response?.ok) || response?.status === 410
}

/**
 * Whether Play itself lists this token as voided (refunded) recently — so a
 * voided-purchase notification is believed only when Google confirms it.
 */
export async function isVoided(token: string, sinceMillis: number): Promise<boolean | undefined> {
  const response = await call(`/purchases/voidedpurchases?type=1&startTime=${Math.max(0, Math.floor(sinceMillis))}`)
  if (!response?.ok) {
    await response?.body?.cancel()
    return undefined
  }
  const body = await response.json()
  const voided: { purchaseToken?: string }[] = body?.voidedPurchases ?? []
  return voided.some((v) => v.purchaseToken === token)
}
