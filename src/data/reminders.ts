/**
 * Reminders, the browser's half (docs/features/reminders.md).
 *
 * - What the person chose (on or off, the time, their zone) is their own row
 *   in `user_preferences`, read and written directly, like the language.
 * - This device's push subscription goes through the `reminders` function,
 *   which keeps the list of devices and the private key out of reach.
 * - Sending is the server's: every 15 minutes it checks who is due.
 */
import { getSupabaseClient, isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client'
import { deviceZone } from './newRecords'
import type { UserId } from '@/domain'

export const DEFAULT_REMINDER_TIME = '22:30'

/** The quarter hours from 16:00 to 04:00, in the order of an evening. */
export const REMINDER_TIMES: string[] = (() => {
  const times: string[] = []
  for (let minutes = 16 * 60; minutes <= 28 * 60; minutes += 15) {
    const of = minutes % (24 * 60)
    times.push(`${String(Math.floor(of / 60)).padStart(2, '0')}:${String(of % 60).padStart(2, '0')}`)
  }
  return times
})()

export interface ReminderPrefs {
  meal: boolean
  watch: boolean
  time: string
  zone?: string
}

/**
 * Whether this browser can be reminded at all.
 *
 * An iPhone can, but only from the Home Screen (iOS 16.4 and later): a
 * Safari tab has no push. That case gets its own answer, because "add it to
 * your Home Screen" is advice someone can act on and "not supported" is not.
 */
export type PushSupport = 'supported' | 'unsupported' | 'ios-home-screen'

export function pushSupport(): PushSupport {
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (iOS && !standalone) return 'ios-home-screen'
  return hasPush ? 'supported' : 'unsupported'
}

export const notificationPermission = (): NotificationPermission =>
  'Notification' in window ? Notification.permission : 'denied'

async function sessionToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured) return undefined
  const { data } = await (await getSupabaseClient()).auth.getSession()
  return data.session?.access_token
}

async function callReminders(body: Record<string, unknown>): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const token = await sessionToken()
  if (!token) return { ok: false, body: {} }
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> }
  } catch {
    return { ok: false, body: {} }
  }
}

/**
 * Whether reminders exist here at all: false until the functions are
 * deployed, so the feature never shows before it works. Asked with the
 * public anon key, since a signed-out visitor may ask too.
 */
export async function remindersDeployed(): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'available' }),
    })
    const body = (await response.json().catch(() => ({}))) as { available?: boolean }
    return response.ok && body.available === true
  } catch {
    return false
  }
}

/**
 * The server's public key, or undefined when reminders are not available.
 *
 * Doubles as the switch for the whole feature: until the functions are
 * deployed it answers nothing, and the Settings card does not appear.
 */
export async function reminderKey(): Promise<string | undefined> {
  const { ok, body } = await callReminders({ action: 'key' })
  return ok && typeof body.publicKey === 'string' ? body.publicKey : undefined
}

export async function readReminderPrefs(userId: UserId): Promise<ReminderPrefs | undefined> {
  if (!isSupabaseConfigured) return undefined
  try {
    const { data, error } = await (await getSupabaseClient())
      .from('user_preferences')
      .select('meal_reminder, watch_reminder, reminder_time, reminder_zone')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return undefined
    const row = data as {
      meal_reminder?: boolean
      watch_reminder?: boolean
      reminder_time?: string
      reminder_zone?: string | null
    } | null
    return {
      meal: row?.meal_reminder === true,
      watch: row?.watch_reminder === true,
      time: row?.reminder_time ?? DEFAULT_REMINDER_TIME,
      zone: row?.reminder_zone ?? undefined,
    }
  } catch {
    return undefined
  }
}

/** Saves the choice, with this device's zone, since "22:30" means 22:30 where the person is. */
export async function saveReminderPrefs(userId: UserId, prefs: ReminderPrefs): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const { error } = await (await getSupabaseClient()).from('user_preferences').upsert({
      user_id: userId,
      meal_reminder: prefs.meal,
      watch_reminder: prefs.watch,
      reminder_time: prefs.time,
      reminder_zone: deviceZone(),
      updated_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

/**
 * Keeps the reminder in step with travel: opened in a new zone, the stored
 * one follows, so 22:30 stays 22:30 on the person's own clock. Best effort,
 * and only when a reminder is on.
 */
export async function keepReminderZone(userId: UserId): Promise<void> {
  const prefs = await readReminderPrefs(userId)
  if (!prefs || (!prefs.meal && !prefs.watch) || prefs.zone === deviceZone()) return
  await saveReminderPrefs(userId, prefs)
}

const fromBase64url = (text: string): Uint8Array<ArrayBuffer> => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

/** The service worker, or undefined if it does not come within ten seconds (blocked, or still installing). */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 10_000)),
  ])
}

export async function thisDeviceSubscribed(): Promise<boolean> {
  if (pushSupport() !== 'supported' || notificationPermission() !== 'granted') return false
  const worker = await registration()
  return Boolean(await worker?.pushManager.getSubscription())
}

/**
 * Asks this device for permission, subscribes it, and tells the server.
 * 'denied' means the person, or their settings, said no.
 */
export async function subscribeThisDevice(publicKey: string): Promise<'ok' | 'denied' | 'failed'> {
  if (pushSupport() !== 'supported') return 'failed'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  try {
    const worker = await registration()
    if (!worker) return 'failed'
    const subscription =
      (await worker.pushManager.getSubscription()) ??
      (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64url(publicKey) }))
    const { endpoint, keys } = subscription.toJSON()
    const { ok } = await callReminders({ action: 'subscribe', subscription: { endpoint, keys } })
    return ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

/** Stops this device: off at the server, and the browser's subscription dropped. */
export async function unsubscribeThisDevice(): Promise<void> {
  const worker = await registration()
  const subscription = await worker?.pushManager.getSubscription()
  if (!subscription) return
  await callReminders({ action: 'unsubscribe', endpoint: subscription.endpoint })
  await subscription.unsubscribe().catch(() => undefined)
}

export async function sendTestReminder(lang: string): Promise<'sent' | 'none' | 'failed'> {
  const { ok, body } = await callReminders({ action: 'test', lang })
  if (!ok) return 'failed'
  return Number(body.sent) > 0 ? 'sent' : 'none'
}
