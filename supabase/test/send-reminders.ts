/**
 * send-reminders, run for real against a stand-in database and push service,
 * at pinned moments of the clock.
 *
 *   deno run --config supabase/deno-check.json -A supabase/test/send-reminders.ts
 */
import { check, finish } from './_stub.ts'
import { browserKeys, reset, rows, startDb, state } from './_reminderStub.ts'
import { generateVapidKeys } from '../functions/_shared/webPush.ts'

Deno.env.set('SUPABASE_URL', 'http://localhost:8992')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-role')
startDb(8992)

/*
  The function reads the real clock. Each case sets "now" by replacing Date
  for the duration of the run: 22:30 in Jerusalem on 21 November 2026 is
  20:30 UTC.
*/
const RealDate = Date
let pinned = RealDate.parse('2026-11-21T20:35:00Z')
// deno-lint-ignore no-explicit-any
;(globalThis as any).Date = class extends RealDate {
  // deno-lint-ignore no-explicit-any
  constructor(...args: any[]) {
    // deno-lint-ignore no-explicit-any
    super(...((args.length === 0 ? [pinned] : args) as [any]))
  }
  static now() {
    return pinned
  }
}
await import('../functions/send-reminders/index.ts')

const DANA = 'bbbbbbbb-0000-4000-8000-000000000001'
const run = async (token = state.remindersToken) => {
  const response = await fetch('http://localhost:8000/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-reminders-token': token },
    body: '{}',
  })
  return { status: response.status, body: await response.json() }
}

async function setUp(prefs: Record<string, unknown> = {}) {
  reset()
  state.vapid = await generateVapidKeys()
  rows('user_preferences').push({
    user_id: DANA,
    meal_reminder: true,
    watch_reminder: false,
    reminder_time: '22:30',
    reminder_zone: 'Asia/Jerusalem',
    language: 'en',
    ...prefs,
  })
  rows('push_subscriptions').push({ id: 'dev-1', user_id: DANA, endpoint: 'https://fcm.googleapis.com/fcm/send/dana', ...(await browserKeys()) })
}

{
  await setUp()
  const r = await run('wrong-token-wrong-token-wrong-token-wrong-token-wrong-token-1234')
  check('without the schedule’s token, nothing is read or sent', r.status === 401 && state.pushes.length === 0)
}
{
  await setUp()
  pinned = RealDate.parse('2026-11-21T20:35:00Z')
  const r = await run()
  check('at her time, with nothing logged, Dana is reminded', r.status === 200 && r.body.meal === 1 && state.pushes.length === 1, JSON.stringify(r.body))
  check('once: the day is claimed', state.claimed.has(`${DANA}|MEAL|2026-11-21`))
  const again = await run()
  check('the next run does not send it again', again.body.meal === 0 && state.pushes.length === 1)
  check('and the device is stamped', typeof rows('push_subscriptions')[0].last_sent_at === 'string')
}
{
  await setUp()
  pinned = RealDate.parse('2026-11-21T20:25:00Z')
  const r = await run()
  check('five minutes early, nothing', r.body.meal === 0 && state.pushes.length === 0)
}
{
  await setUp()
  rows('meals').push({ user_id: DANA, day: '2026-11-21', data: { id: 'm1', version: 1 } })
  pinned = RealDate.parse('2026-11-21T20:35:00Z')
  const r = await run()
  check('a day with a meal on it needs no reminder', r.body.meal === 0 && state.pushes.length === 0)
}
{
  await setUp()
  rows('meals').push({ user_id: DANA, day: '2026-11-21', data: { id: 'm1', version: 1 } })
  rows('meals').push({ user_id: DANA, day: '2026-11-21', data: { id: 'm1', version: 2, retracted: true } })
  pinned = RealDate.parse('2026-11-21T20:35:00Z')
  const r = await run()
  check('a meal that was deleted does not count as logged', r.body.meal === 1)
}
{
  // 01:00 in Jerusalem on the 22nd is 23:00 UTC on the 21st: the reminder is about the 21st.
  await setUp({ reminder_time: '01:00' })
  rows('meals').push({ user_id: DANA, day: '2026-11-22', data: { id: 'breakfast-tomorrow', version: 1 } })
  pinned = RealDate.parse('2026-11-21T23:05:00Z')
  const r = await run()
  check('a reminder after midnight asks about the evening before', r.body.meal === 1 && state.claimed.has(`${DANA}|MEAL|2026-11-21`))
}
{
  await setUp({ reminder_zone: 'America/New_York' })
  pinned = RealDate.parse('2026-11-21T20:35:00Z')
  const early = await run()
  pinned = RealDate.parse('2026-11-22T03:35:00Z')
  const onTime = await run()
  check('her own zone decides, not the server’s', early.body.meal === 0 && onTime.body.meal === 1 && state.claimed.has(`${DANA}|MEAL|2026-11-21`))
}
{
  await setUp({ meal_reminder: false })
  pinned = RealDate.parse('2026-11-21T20:35:00Z')
  const r = await run()
  check('switched off, nothing is sent', r.body.meal === 0 && state.pushes.length === 0)
}
{
  await setUp({ reminder_zone: 'Not/AZone' })
  const r = await run()
  check('a zone that is not a zone is skipped, not guessed', r.status === 200 && state.pushes.length === 0)
}
{
  await setUp({ meal_reminder: false, watch_reminder: true })
  rows('device_tokens').push({ user_id: DANA, revoked_at: null, created_at: '2026-10-01T00:00:00Z', last_used_at: '2026-11-17T06:00:00Z' })
  pinned = RealDate.parse('2026-11-21T20:35:00Z')
  const r = await run()
  check('a watch quiet for four days gets the watch reminder', r.body.watch === 1 && state.pushes.length === 1)
  check('claimed with a three-day gap', state.claimed.has(`${DANA}|WATCH|2026-11-21`))
}
{
  await setUp({ meal_reminder: false, watch_reminder: true })
  rows('device_tokens').push({ user_id: DANA, revoked_at: null, created_at: '2026-10-01T00:00:00Z', last_used_at: '2026-11-21T06:00:00Z' })
  const r = await run()
  check('a watch that synced this morning does not', r.body.watch === 0)
}
{
  await setUp({ meal_reminder: false, watch_reminder: true })
  rows('device_tokens').push({ user_id: DANA, revoked_at: '2026-11-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', last_used_at: '2026-10-02T00:00:00Z' })
  const r = await run()
  check('a disconnected watch is not nagged about', r.body.watch === 0)
}
{
  await setUp()
  state.pushStatus.set('https://fcm.googleapis.com/fcm/send/dana', 404)
  const r = await run()
  check('a device that is gone is forgotten', r.body.gone === 1 && rows('push_subscriptions').length === 0)
}
{
  await setUp()
  state.vapid = undefined
  const r = await run()
  check('before anyone ever subscribed, there is nothing to send', r.status === 200 && r.body.checked === 0)
}

finish('send-reminders')
