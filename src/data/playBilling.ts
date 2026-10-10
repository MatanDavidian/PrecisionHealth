/**
 * Google Play Billing, from inside the Android app (docs/ANDROID-APP.md, step 4).
 *
 * The Android app is this website in a Trusted Web Activity. There, Play's
 * rules apply: the plan is sold through Google Play, never Lemon Squeezy.
 * Chrome exposes Play through two browser APIs:
 * - the Digital Goods API, which lists what the person owns and gives
 *   Play's local price
 * - the Payment Request API, which runs Play's purchase sheet
 *
 * A purchase token is only a claim until the server confirms it with Play
 * (`play-billing`), which also acknowledges it — or Google refunds it after
 * three days. So the token goes to the server at once, and again on every
 * start for anything Play still lists, in case the app was closed between
 * paying and reporting.
 */
import { PLAY_PRODUCT_ID } from '../../supabase/functions/_shared/plan'
import { getSupabaseClient, isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client'

const PLAY_BILLING = 'https://play.google.com/billing'
const ANDROID_APP_KEY = 'vimetry.androidApp'

interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<{ itemId: string; price: { currency: string; value: string } }[]>
  listPurchases(): Promise<{ itemId: string; purchaseToken: string }[]>
}
declare global {
  interface Window {
    getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService>
  }
}

/**
 * Whether this page is the Android app. The app starts at `/?source=twa`
 * (android/twa-manifest.json), remembered for the visit since in-app
 * navigation drops the query.
 */
export function inAndroidApp(): boolean {
  try {
    if (new URLSearchParams(location.search).get('source') === 'twa') sessionStorage.setItem(ANDROID_APP_KEY, '1')
    if (document.referrer.startsWith('android-app://')) sessionStorage.setItem(ANDROID_APP_KEY, '1')
    return sessionStorage.getItem(ANDROID_APP_KEY) === '1'
  } catch {
    return false
  }
}

/** Play Billing, when Chrome offers it — only inside the Android app, on Chrome 101 or later. */
export async function playBilling(): Promise<DigitalGoodsService | undefined> {
  if (!window.getDigitalGoodsService) return undefined
  try {
    return await window.getDigitalGoodsService(PLAY_BILLING)
  } catch {
    return undefined
  }
}

/** Play's price for the plan, in the person's currency ("₪33.90"), or undefined. */
export async function playPrice(service: DigitalGoodsService, locale?: string): Promise<string | undefined> {
  try {
    const [details] = await service.getDetails([PLAY_PRODUCT_ID])
    if (!details) return undefined
    return new Intl.NumberFormat(locale, { style: 'currency', currency: details.price.currency })
      .format(Number(details.price.value))
  } catch {
    return undefined
  }
}

export type PlayResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'already_subscribed' | 'not_signed_in' | 'unavailable' }

/** Tells the server about a purchase token; the server confirms it with Play. */
export async function reportPlayPurchase(purchaseToken: string): Promise<PlayResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'unavailable' }
  const client = await getSupabaseClient()
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, reason: 'not_signed_in' }
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/play-billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ purchaseToken }),
    })
    if (response.ok) return { ok: true }
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (body.error === 'already_subscribed') return { ok: false, reason: 'already_subscribed' }
    if (response.status === 401) return { ok: false, reason: 'not_signed_in' }
  } catch {
    // Offline: the start-up pass reports it again.
  }
  return { ok: false, reason: 'unavailable' }
}

/** Play's purchase sheet for the plan, then the server's confirmation. */
export async function buyOnPlay(): Promise<PlayResult> {
  let request: PaymentRequest
  try {
    request = new PaymentRequest(
      [{ supportedMethods: PLAY_BILLING, data: { sku: PLAY_PRODUCT_ID } }],
      // Required by the API and ignored by Play, which charges its own price.
      { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } },
    )
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
  let response: PaymentResponse
  try {
    response = await request.show()
  } catch {
    // Closed the sheet, or Play said no: nothing was bought.
    return { ok: false, reason: 'cancelled' }
  }
  const purchaseToken = (response.details as { purchaseToken?: string })?.purchaseToken
  const result = purchaseToken ? await reportPlayPurchase(purchaseToken) : { ok: false as const, reason: 'unavailable' as const }
  await response.complete(result.ok ? 'success' : 'fail').catch(() => {})
  return result
}

/** On start: anything Play lists that the server may not have been told about. */
export async function reconcilePlayPurchases(): Promise<boolean> {
  const service = await playBilling()
  if (!service) return false
  let reported = false
  try {
    for (const purchase of await service.listPurchases()) {
      if (purchase.itemId !== PLAY_PRODUCT_ID) continue
      if ((await reportPlayPurchase(purchase.purchaseToken)).ok) reported = true
    }
  } catch {
    // Listing failed: the next start tries again.
  }
  return reported
}
