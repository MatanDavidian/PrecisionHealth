/**
 * The reminders' schedule (docs/features/reminders.md), every 15 minutes.
 *
 * Deployed with `--no-verify-jwt`: the caller is the database's own
 * scheduler (pg_cron, migration 0018), not a user. What proves that instead
 * is a token the migration made inside the database, which no person has
 * ever seen; anything without it is refused before a single read.
 *
 * For each person with a reminder on: if it is their time, in their own
 * zone, and they have logged nothing that day, a reminder goes to each of
 * their devices, once (the database refuses a second claim for the day).
 * The watch reminder rides the same clock, and waits three days between two.
 */
import { VERSION } from '../_shared/version.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  dayHasMeal,
  dueDay,
  dueToday,
  isReminderTime,
  isSlotTime,
  isZone,
  MEAL_REMINDER_SLOTS,
  reminderMessage,
  slotLogged,
  slotMessage,
  watchSilent,
  WATCH_SILENT_DAYS,
  type MealReminderSlot,
  type ReminderKind,
  type UsualChoice,
} from '../_shared/reminderRules.ts'
import { deliver, pushKeys, type Delivery } from '../_shared/pushDelivery.ts'

const HEADERS = { 'x-vimetry-version': VERSION, 'Access-Control-Expose-Headers': 'x-vimetry-version' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json' } })

/** A reminder unread after three hours is about an evening that has passed: the push service may drop it. */
const REMINDER_TTL_SECONDS = 3 * 60 * 60

interface Preference {
  user_id: string
  meal_reminder: boolean
  watch_reminder: boolean
  reminder_time: string
  reminder_zone: string | null
  language: string | null
  breakfast_reminder?: boolean
  breakfast_time?: string
  lunch_reminder?: boolean
  lunch_time?: string
  dinner_reminder?: boolean
  dinner_time?: string
  reminder_usuals?: Partial<Record<MealReminderSlot, UsualChoice[]>> | null
}

type MealRow = { data: { id?: string; version?: number; retracted?: boolean; slot?: string; provenance?: { source?: string } } }

/** A meal reminder's switch and time on the preferences row. */
const slotSetting = (person: Preference, slot: MealReminderSlot) => {
  const name = slot.toLowerCase() as 'breakfast' | 'lunch' | 'dinner'
  return { on: person[`${name}_reminder`] === true, time: person[`${name}_time`] }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const token = request.headers.get('x-reminders-token') ?? ''
  const { data: allowed, error: tokenError } = await admin.rpc('reminders_token_ok', { p_token: token })
  if (tokenError) return json({ error: 'unavailable' }, 503)
  if (allowed !== true) return json({ error: 'unauthorized' }, 401)

  const totals = { checked: 0, meal: 0, watch: 0, slots: 0, sent: 0, gone: 0, failed: 0 }
  try {
    // No keys means nobody has ever subscribed: nothing to send.
    const keys = await pushKeys(admin, false)
    if (!keys) return json(totals)

    const columns =
      'user_id, meal_reminder, watch_reminder, reminder_time, reminder_zone, language, ' +
      'breakfast_reminder, breakfast_time, lunch_reminder, lunch_time, dinner_reminder, dinner_time, reminder_usuals'
    const reads = await Promise.all(
      ['meal_reminder', 'watch_reminder', 'breakfast_reminder', 'lunch_reminder', 'dinner_reminder'].map((column) =>
        admin.from('user_preferences').select(columns).eq(column, true),
      ),
    )
    const failedRead = reads.find((read) => read.error)
    if (failedRead) throw new Error(failedRead.error!.message)
    const people = new Map<string, Preference>()
    for (const row of reads.flatMap((read) => (read.data ?? []) as unknown as Preference[])) people.set(row.user_id, row)

    const now = new Date()
    for (const person of people.values()) {
      totals.checked += 1
      if (!isZone(person.reminder_zone)) continue
      const zone = person.reminder_zone

      // Breakfast, lunch, dinner (meal-reminders.md): each at its own time,
      // only if that meal is not logged yet today, with the usual one as a button.
      const mealsByDay = new Map<string, MealRow[]>()
      const mealsOn = async (day: string): Promise<MealRow[]> => {
        if (!mealsByDay.has(day)) {
          const { data, error } = await admin.from('meals').select('data').eq('user_id', person.user_id).eq('day', day)
          if (error) throw new Error(error.message)
          mealsByDay.set(day, (data ?? []) as MealRow[])
        }
        return mealsByDay.get(day)!
      }
      for (const slot of MEAL_REMINDER_SLOTS) {
        const setting = slotSetting(person, slot)
        if (!setting.on || !isSlotTime(slot, setting.time)) continue
        const slotDay = dueToday(setting.time, zone, now)
        if (!slotDay || slotLogged(await mealsOn(slotDay), slot)) continue
        const { data: claimed, error } = await admin.rpc('claim_reminder', {
          p_user: person.user_id,
          p_kind: slot,
          p_day: slotDay,
          p_gap_days: 1,
        })
        if (error) throw new Error(error.message)
        if (claimed !== true) continue
        const usuals = person.reminder_usuals?.[slot]
        const delivered = await deliver(
          admin,
          person.user_id,
          slotMessage(slot, person.language, Array.isArray(usuals) ? usuals : undefined, slotDay),
          keys,
          // A lunch reminder at dinner is no use: it expires in an hour.
          60 * 60,
        )
        totals.slots += 1
        totals.sent += delivered.sent
        totals.gone += delivered.gone
        totals.failed += delivered.failed
      }

      // The evening reminder and the watch, as before.
      if (!isReminderTime(person.reminder_time)) continue
      const day = dueDay(person.reminder_time, zone, now)
      if (!day) continue

      const due: ReminderKind[] = []
      if (person.meal_reminder) {
        if (!dayHasMeal(await mealsOn(day))) due.push('MEAL')
      }
      if (person.watch_reminder) {
        const { data: watches, error } = await admin
          .from('device_tokens')
          .select('last_used_at, created_at')
          .eq('user_id', person.user_id)
          .is('revoked_at', null)
        if (error) throw new Error(error.message)
        if (watchSilent((watches ?? []) as { last_used_at: string | null; created_at: string }[], now)) due.push('WATCH')
      }

      for (const kind of due) {
        // Claimed before it is sent: at most once, even if two runs overlap.
        const { data: claimed, error } = await admin.rpc('claim_reminder', {
          p_user: person.user_id,
          p_kind: kind,
          p_day: day,
          p_gap_days: kind === 'WATCH' ? WATCH_SILENT_DAYS : 1,
        })
        if (error) throw new Error(error.message)
        if (claimed !== true) continue
        const delivered: Delivery = await deliver(admin, person.user_id, reminderMessage(kind, person.language), keys, REMINDER_TTL_SECONDS)
        if (kind === 'MEAL') totals.meal += 1
        else totals.watch += 1
        totals.sent += delivered.sent
        totals.gone += delivered.gone
        totals.failed += delivered.failed
      }
    }
    return json(totals)
  } catch (cause) {
    console.error('send-reminders failed', cause instanceof Error ? cause.message : cause)
    return json({ error: 'unavailable', ...totals }, 503)
  }
})
