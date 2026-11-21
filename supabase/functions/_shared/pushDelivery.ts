/**
 * Sending to a person's devices, shared by `reminders` (the test) and
 * `send-reminders` (the schedule).
 */
import { generateVapidKeys, sendPush, type VapidKeys } from './webPush.ts'
import type { ReminderMessage } from './reminderRules.ts'

/** Who the push services are told is sending: a mailbox someone reads. */
export const PUSH_SUBJECT = 'mailto:support@vimetry.app'

/**
 * The server's push keys, made on first use and kept for good (migration
 * 0018): a new pair would orphan every device already subscribed. Two
 * first calls at once agree, because the database keeps whichever came
 * first and both read that one back.
 */
// deno-lint-ignore no-explicit-any
export async function pushKeys(admin: any, create: boolean): Promise<VapidKeys | undefined> {
  const { data, error } = await admin.rpc('push_keys')
  if (error) throw new Error(`push_keys: ${error.message}`)
  if (data) return data as VapidKeys
  if (!create) return undefined
  const { data: stored, error: initError } = await admin.rpc('push_keys_init', { p_keys: await generateVapidKeys() })
  if (initError) throw new Error(`push_keys_init: ${initError.message}`)
  return stored as VapidKeys
}

export interface Delivery {
  sent: number
  gone: number
  failed: number
}

/**
 * The message to every device the person subscribed. A device the push
 * service says is gone (unsubscribed, reinstalled) is forgotten; any other
 * failure is left for next time.
 */
export async function deliver(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  message: ReminderMessage,
  keys: VapidKeys,
  ttlSeconds: number,
): Promise<Delivery> {
  const result: Delivery = { sent: 0, gone: 0, failed: 0 }
  const { data: devices, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (error) throw new Error(`push_subscriptions: ${error.message}`)
  for (const device of (devices ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    const { outcome } = await sendPush(device, message, keys, {
      subject: PUSH_SUBJECT,
      ttlSeconds,
      // One per kind: an unread reminder is replaced by the next, not stacked.
      topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
    })
    if (outcome === 'SENT') {
      result.sent += 1
      await admin.from('push_subscriptions').update({ last_sent_at: new Date().toISOString() }).eq('id', device.id)
    } else if (outcome === 'GONE') {
      result.gone += 1
      await admin.from('push_subscriptions').delete().eq('id', device.id)
    } else {
      result.failed += 1
    }
  }
  return result
}
