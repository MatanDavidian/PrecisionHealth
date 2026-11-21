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
import { dayHasMeal, dueDay, isReminderTime, isZone, reminderMessage, watchSilent, WATCH_SILENT_DAYS, type ReminderKind } from '../_shared/reminderRules.ts'
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
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const token = request.headers.get('x-reminders-token') ?? ''
  const { data: allowed, error: tokenError } = await admin.rpc('reminders_token_ok', { p_token: token })
  if (tokenError) return json({ error: 'unavailable' }, 503)
  if (allowed !== true) return json({ error: 'unauthorized' }, 401)

  const totals = { checked: 0, meal: 0, watch: 0, sent: 0, gone: 0, failed: 0 }
  try {
    // No keys means nobody has ever subscribed: nothing to send.
    const keys = await pushKeys(admin, false)
    if (!keys) return json(totals)

    const columns = 'user_id, meal_reminder, watch_reminder, reminder_time, reminder_zone, language'
    const [meal, watch] = await Promise.all([
      admin.from('user_preferences').select(columns).eq('meal_reminder', true),
      admin.from('user_preferences').select(columns).eq('watch_reminder', true),
    ])
    if (meal.error || watch.error) throw new Error((meal.error ?? watch.error)!.message)
    const people = new Map<string, Preference>()
    for (const row of [...(meal.data ?? []), ...(watch.data ?? [])] as Preference[]) people.set(row.user_id, row)

    const now = new Date()
    for (const person of people.values()) {
      totals.checked += 1
      if (!isReminderTime(person.reminder_time) || !isZone(person.reminder_zone)) continue
      const day = dueDay(person.reminder_time, person.reminder_zone, now)
      if (!day) continue

      const due: ReminderKind[] = []
      if (person.meal_reminder) {
        const { data: meals, error } = await admin.from('meals').select('data').eq('user_id', person.user_id).eq('day', day)
        if (error) throw new Error(error.message)
        if (!dayHasMeal((meals ?? []) as { data: { id?: string; version?: number; retracted?: boolean } }[])) due.push('MEAL')
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
