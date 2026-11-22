import { describe, expect, it } from 'vitest'
import {
  dayHasMeal,
  dueDay,
  dueToday,
  isSlotTime,
  slotLogged,
  slotMessage,
  isReminderTime,
  localClock,
  reminderMessage,
  watchSilent,
} from '../../supabase/functions/_shared/reminderRules'

/**
 * Who is due a reminder (supabase/functions/_shared/reminderRules.ts):
 * the clock, the zone, the night after midnight, the late schedule.
 */

const at = (iso: string) => new Date(iso)

describe('the reminder time', () => {
  it('is an evening or night quarter hour', () => {
    for (const ok of ['16:00', '22:30', '23:45', '00:00', '01:15', '04:00']) expect(isReminderTime(ok)).toBe(true)
    for (const bad of ['12:00', '15:45', '04:15', '22:10', '24:00', '9:00', 2230]) expect(isReminderTime(bad)).toBe(false)
  })
})

describe('the local clock', () => {
  it('reads the date and minute in the person’s own zone', () => {
    // 19:30 UTC is 21:30 in Jerusalem in November (UTC+2).
    expect(localClock(at('2026-11-21T19:30:00Z'), 'Asia/Jerusalem')).toEqual({ date: '2026-11-21', minutes: 21 * 60 + 30 })
    // And still the 21st in New York, five hours behind UTC.
    expect(localClock(at('2026-11-22T03:00:00Z'), 'America/New_York')).toEqual({ date: '2026-11-21', minutes: 22 * 60 })
  })
})

describe('when a reminder is due', () => {
  const ZONE = 'Asia/Jerusalem'
  // 22:30 in Jerusalem on 21 November is 20:30 UTC.
  it('at its time, for that day', () => {
    expect(dueDay('22:30', ZONE, at('2026-11-21T20:30:00Z'))).toBe('2026-11-21')
  })
  it('not a minute before', () => {
    expect(dueDay('22:30', ZONE, at('2026-11-21T20:29:00Z'))).toBeUndefined()
  })
  it('still, if the schedule runs late, for up to two hours, across midnight', () => {
    expect(dueDay('22:30', ZONE, at('2026-11-21T22:29:00Z'))).toBe('2026-11-21')
    expect(dueDay('22:30', ZONE, at('2026-11-21T22:30:00Z'))).toBeUndefined()
  })
  it('a reminder after midnight belongs to the evening before', () => {
    // 01:00 on the 22nd in Jerusalem is 23:00 UTC on the 21st.
    expect(dueDay('01:00', ZONE, at('2026-11-21T23:00:00Z'))).toBe('2026-11-21')
    // At 01:00 on the 21st, the 01:00 reminder is the 20th's.
    expect(dueDay('01:00', ZONE, at('2026-11-20T23:00:00Z'))).toBe('2026-11-20')
  })
  it('a 16:00 reminder is not due the morning after', () => {
    expect(dueDay('16:00', ZONE, at('2026-11-22T06:00:00Z'))).toBeUndefined()
  })
  it('follows the person’s zone, not the server’s', () => {
    // 22:30 in New York on the 21st is 03:30 UTC on the 22nd.
    expect(dueDay('22:30', 'America/New_York', at('2026-11-22T03:30:00Z'))).toBe('2026-11-21')
    expect(dueDay('22:30', 'Asia/Jerusalem', at('2026-11-22T03:30:00Z'))).toBeUndefined()
  })
})

describe('whether the day was logged', () => {
  it('a meal counts; nothing does not', () => {
    expect(dayHasMeal([{ data: { id: 'm1', version: 1 } }])).toBe(true)
    expect(dayHasMeal([])).toBe(false)
  })
  it('a meal whose newest version deletes it does not count', () => {
    expect(dayHasMeal([{ data: { id: 'm1', version: 1 } }, { data: { id: 'm1', version: 2, retracted: true } }])).toBe(false)
  })
  it('a deletion that was then undone counts again', () => {
    expect(
      dayHasMeal([
        { data: { id: 'm1', version: 1 } },
        { data: { id: 'm1', version: 2, retracted: true } },
        { data: { id: 'm1', version: 3, retracted: false } },
      ]),
    ).toBe(true)
  })
})

describe('whether a watch has gone quiet', () => {
  const now = at('2026-11-21T20:00:00Z')
  it('after three days without a sync', () => {
    expect(watchSilent([{ last_used_at: '2026-11-18T20:00:00Z', created_at: '2026-10-01T00:00:00Z' }], now)).toBe(true)
    expect(watchSilent([{ last_used_at: '2026-11-18T21:00:00Z', created_at: '2026-10-01T00:00:00Z' }], now)).toBe(false)
  })
  it('a watch that never synced counts from when it was connected', () => {
    expect(watchSilent([{ last_used_at: null, created_at: '2026-11-20T00:00:00Z' }], now)).toBe(false)
    expect(watchSilent([{ last_used_at: null, created_at: '2026-11-01T00:00:00Z' }], now)).toBe(true)
  })
  it('one watch still syncing means the days are arriving', () => {
    expect(
      watchSilent(
        [
          { last_used_at: '2026-11-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' },
          { last_used_at: '2026-11-21T06:00:00Z', created_at: '2026-10-01T00:00:00Z' },
        ],
        now,
      ),
    ).toBe(false)
  })
  it('no watch, no reminder', () => {
    expect(watchSilent([], now)).toBe(false)
  })
})

describe('the words', () => {
  it('say nothing about what anyone ate', () => {
    for (const kind of ['MEAL', 'WATCH', 'TEST'] as const) {
      for (const lang of ['en', 'he']) {
        const message = reminderMessage(kind, lang)
        expect(message.body).not.toMatch(/kcal|calorie|קלורי|protein|חלבון|weight|משקל/i)
        expect(message.url.startsWith('/')).toBe(true)
      }
    }
  })
  it('in Hebrew for a Hebrew account, English otherwise', () => {
    expect(reminderMessage('MEAL', 'he').body).toMatch(/הגיע הזמן/)
    expect(reminderMessage('MEAL', null).body).toMatch(/^Time to log today/)
  })
})


describe('meal reminders (meal-reminders.md)', () => {
  const ZONE = 'Asia/Jerusalem'
  it('each meal keeps to its own window', () => {
    expect(isSlotTime('BREAKFAST', '08:30')).toBe(true)
    expect(isSlotTime('BREAKFAST', '12:00')).toBe(false)
    expect(isSlotTime('LUNCH', '11:00')).toBe(true)
    expect(isSlotTime('LUNCH', '17:00')).toBe(false)
    expect(isSlotTime('DINNER', '23:45')).toBe(true)
    expect(isSlotTime('DINNER', '00:00')).toBe(false)
  })
  it('is due from its time for ninety minutes, the same day only', () => {
    // 13:30 in Jerusalem is 11:30 UTC.
    expect(dueToday('13:30', ZONE, at('2026-11-21T11:29:00Z'))).toBeUndefined()
    expect(dueToday('13:30', ZONE, at('2026-11-21T11:30:00Z'))).toBe('2026-11-21')
    expect(dueToday('13:30', ZONE, at('2026-11-21T12:59:00Z'))).toBe('2026-11-21')
    expect(dueToday('13:30', ZONE, at('2026-11-21T13:00:00Z'))).toBeUndefined()
  })
  it('a meal in the slot counts; one in another slot does not; a set day counts for all', () => {
    const meal = (slot: string, extra: Record<string, unknown> = {}) => ({ data: { id: slot, version: 1, slot, provenance: { source: 'USER' }, ...extra } })
    expect(slotLogged([meal('LUNCH')], 'LUNCH')).toBe(true)
    expect(slotLogged([meal('BREAKFAST')], 'LUNCH')).toBe(false)
    expect(slotLogged([meal('SNACK', { provenance: { source: 'PATTERN_FILL' } })], 'DINNER')).toBe(true)
    expect(slotLogged([meal('LUNCH'), { data: { id: 'LUNCH', version: 2, slot: 'LUNCH', retracted: true } }], 'LUNCH')).toBe(false)
  })
  it('names the usual meal as a button that logs it once, and offers something else', () => {
    const message = slotMessage('LUNCH', 'en', [{ key: 'chicken + rice', name: 'Chicken, rice', kcal: 650 }], '2026-11-21')
    expect(message.title).toBe('Lunch?')
    expect(message.actions).toEqual([
      { action: 'usual', title: 'Chicken, rice' },
      { action: 'other', title: 'Something else' },
    ])
    expect(message.url).toBe('/quick?slot=LUNCH')
    expect(message.actionUrls?.usual).toBe('/quick?slot=LUNCH&log=chicken%20%2B%20rice&once=2026-11-21-LUNCH')
    expect(message.actionUrls?.other).toBe('/quick?slot=LUNCH')
  })
  it('without a usual meal yet: no buttons, a tap opens the sheet', () => {
    const message = slotMessage('BREAKFAST', 'he', [], '2026-11-21')
    expect(message.title).toBe('ארוחת בוקר?')
    expect(message.actions).toBeUndefined()
    expect(message.url).toBe('/quick?slot=BREAKFAST')
  })
  it('a long meal name is shortened for the button', () => {
    const name = 'Grilled chicken breast, white rice, tahini, chopped salad and pita'
    const message = slotMessage('DINNER', 'en', [{ key: 'k', name, kcal: 900 }], '2026-11-21')
    expect(message.actions?.[0].title.length).toBeLessThanOrEqual(40)
    expect(message.actions?.[0].title.endsWith('…')).toBe(true)
  })
})
