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
import { convert, liveItems, type UserId } from '@/domain'
import { readUsuals } from './usuals'

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

export type MealReminderSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER'
export const MEAL_REMINDER_SLOTS: MealReminderSlot[] = ['BREAKFAST', 'LUNCH', 'DINNER']

/** Each meal's window and default (meal-reminders.md); the database checks the same windows. */
export const SLOT_REMINDER: Record<MealReminderSlot, { from: string; to: string; default: string }> = {
  BREAKFAST: { from: '05:00', to: '11:45', default: '08:30' },
  LUNCH: { from: '11:00', to: '16:45', default: '13:30' },
  DINNER: { from: '17:00', to: '23:45', default: '20:00' },
}

/** The quarter hours of a meal's window. */
export function slotTimes(slot: MealReminderSlot): string[] {
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  const times: string[] = []
  for (let m = toMinutes(SLOT_REMINDER[slot].from); m <= toMinutes(SLOT_REMINDER[slot].to); m += 15) {
    times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return times
}

export interface ReminderPrefs {
  /** The evening "nothing logged today" reminder. */
  meal: boolean
  watch: boolean
  time: string
  zone?: string
  /** Breakfast, lunch and dinner, each on or off at its own time. */
  slots: Record<MealReminderSlot, { on: boolean; time: string }>
}

export const defaultSlots = (): ReminderPrefs['slots'] => ({
  BREAKFAST: { on: false, time: SLOT_REMINDER.BREAKFAST.default },
  LUNCH: { on: false, time: SLOT_REMINDER.LUNCH.default },
  DINNER: { on: false, time: SLOT_REMINDER.DINNER.default },
})

/** Whether any reminder at all is on, which is what keeps this device subscribed. */
export const anyReminderOn = (prefs: ReminderPrefs): boolean =>
  prefs.meal || prefs.watch || MEAL_REMINDER_SLOTS.some((slot) => prefs.slots[slot].on)

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
      .select(
        'meal_reminder, watch_reminder, reminder_time, reminder_zone, ' +
          'breakfast_reminder, breakfast_time, lunch_reminder, lunch_time, dinner_reminder, dinner_time',
      )
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return undefined
    const row = (data ?? {}) as Record<string, unknown>
    const slots = defaultSlots()
    for (const slot of MEAL_REMINDER_SLOTS) {
      const name = slot.toLowerCase()
      slots[slot] = {
        on: row[`${name}_reminder`] === true,
        time: typeof row[`${name}_time`] === 'string' ? (row[`${name}_time`] as string) : SLOT_REMINDER[slot].default,
      }
    }
    return {
      meal: row.meal_reminder === true,
      watch: row.watch_reminder === true,
      time: typeof row.reminder_time === 'string' ? row.reminder_time : DEFAULT_REMINDER_TIME,
      zone: typeof row.reminder_zone === 'string' ? row.reminder_zone : undefined,
      slots,
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
      breakfast_reminder: prefs.slots.BREAKFAST.on,
      breakfast_time: prefs.slots.BREAKFAST.time,
      lunch_reminder: prefs.slots.LUNCH.on,
      lunch_time: prefs.slots.LUNCH.time,
      dinner_reminder: prefs.slots.DINNER.on,
      dinner_time: prefs.slots.DINNER.time,
      reminder_zone: deviceZone(),
      updated_at: new Date().toISOString(),
    })
    if (error) return false
    if (MEAL_REMINDER_SLOTS.some((slot) => prefs.slots[slot].on)) await saveReminderUsuals(userId)
    return true
  } catch {
    return false
  }
}

/** A usual meal as a notification button shows it. */
export interface UsualChoice {
  key: string
  name: string
  kcal: number
}

/**
 * The top three usual meals for each meal time, saved for the buttons
 * (meal-reminders.md). The app works them out with the same rule as the
 * "Again" panel, so a button never offers a meal the app would not; the
 * schedule only reads them. At most as old as the last time the app opened.
 */
export async function usualChoices(userId: UserId): Promise<Record<MealReminderSlot, UsualChoice[]>> {
  const out = {} as Record<MealReminderSlot, UsualChoice[]>
  for (const slot of MEAL_REMINDER_SLOTS) {
    const { forThisSlot } = await readUsuals(userId, slot)
    out[slot] = forThisSlot.map((usual) => ({
      key: usual.signature,
      name: liveItems(usual.template.items).map((item) => item.name).join(', ').slice(0, 80),
      kcal: Math.round(liveItems(usual.template.items).reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0)),
    }))
  }
  return out
}

export async function saveReminderUsuals(userId: UserId): Promise<void> {
  if (!isSupabaseConfigured) return
  try {
    const reminder_usuals = await usualChoices(userId)
    // An upsert rather than an update: it also works before the row exists,
    // and touches only these columns when it does.
    await (await getSupabaseClient())
      .from('user_preferences')
      .upsert({ user_id: userId, reminder_usuals, updated_at: new Date().toISOString() })
  } catch {
    // Best effort: the buttons wait for the next time the app opens.
  }
}

/**
 * Keeps the reminder in step with travel: opened in a new zone, the stored
 * one follows, so 22:30 stays 22:30 on the person's own clock. Best effort,
 * and only when a reminder is on.
 */
export async function keepReminderZone(userId: UserId): Promise<void> {
  const prefs = await readReminderPrefs(userId)
  if (!prefs || !anyReminderOn(prefs)) return
  if (prefs.zone !== deviceZone()) await saveReminderPrefs(userId, prefs)
  // The usual meals move with what is eaten: refreshed each time the app opens.
  else if (MEAL_REMINDER_SLOTS.some((slot) => prefs.slots[slot].on)) await saveReminderUsuals(userId)
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
