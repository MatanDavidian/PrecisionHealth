import { describe, expect, it } from 'vitest'
import {
  addDays,
  canonical,
  dayKey,
  daysBetween,
  repeatDay,
  timeOfDay,
  userEntered,
  weekContaining,
  zonedTimeToUtc,
  type CalendarDate,
  type Meal,
  type MealId,
  type UserId,
} from '..'

/**
 * Israel's clock changes, on the real dates.
 *
 * Autumn: Sunday 25 Oct 2026, 02:00 IDT → 01:00 IST. At 23:00 UTC on the 24th
 * the clock reads 01:59 and then 01:00 again — the 25th has 25 hours, and
 * 01:00–01:59 happens twice.
 *
 * Spring: Friday 26 Mar 2027, 02:00 IST → 03:00 IDT. At 00:00 UTC the clock
 * jumps from 01:59 to 03:00 — the 26th has 23 hours, and 02:00–02:59 never
 * happens.
 *
 * The bug these guard against is the classic one: treating a day as 24 hours
 * somewhere, so a meal lands on the wrong day, a day is skipped or repeated,
 * or a "02:30" that does not exist throws or vanishes. The transition instants
 * above were read from Intl for this zone, not assumed.
 */

const ZONE = 'Asia/Jerusalem'
const AUTUMN = '2026-10-25' as CalendarDate
const SPRING = '2027-03-26' as CalendarDate

const hoursBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000

describe('the autumn change — a 25-hour day', () => {
  it('files both 01:30s on the same day', () => {
    // 22:30 UTC is the first 01:30 (still summer time), 23:30 UTC the second.
    expect(dayKey('2026-10-24T22:30:00.000Z', ZONE)).toBe(AUTUMN)
    expect(dayKey('2026-10-24T23:30:00.000Z', ZONE)).toBe(AUTUMN)
  })

  it('puts the edges of the day on the right side of midnight', () => {
    expect(dayKey('2026-10-24T20:59:00.000Z', ZONE)).toBe('2026-10-24') // 23:59 summer time
    expect(dayKey('2026-10-24T21:00:00.000Z', ZONE)).toBe(AUTUMN) //        00:00
    expect(dayKey('2026-10-25T21:59:00.000Z', ZONE)).toBe(AUTUMN) //        23:59 winter time
    expect(dayKey('2026-10-25T22:00:00.000Z', ZONE)).toBe('2026-10-26') // 00:00
  })

  it('is 25 hours long, midnight to midnight', () => {
    const start = zonedTimeToUtc(AUTUMN, '00:00', ZONE)
    const end = zonedTimeToUtc(addDays(AUTUMN, 1), '00:00', ZONE)
    expect(start).toBe('2026-10-24T21:00:00.000Z')
    expect(end).toBe('2026-10-25T22:00:00.000Z')
    expect(hoursBetween(start, end)).toBe(25)
  })

  it('resolves an ambiguous 01:30 to the earlier one, as documented', () => {
    expect(zonedTimeToUtc(AUTUMN, '01:30', ZONE)).toBe('2026-10-24T22:30:00.000Z')
  })

  it('uses winter time for the rest of the day', () => {
    expect(zonedTimeToUtc(AUTUMN, '12:00', ZONE)).toBe('2026-10-25T10:00:00.000Z')
    expect(zonedTimeToUtc('2026-10-24' as CalendarDate, '12:00', ZONE)).toBe('2026-10-24T09:00:00.000Z')
  })

  it('reads the clock time of a meal in the repeated hour as the hour the person saw', () => {
    // Both readings say 01:30; neither is shifted by an hour.
    expect(timeOfDay(meal('2026-10-24T22:30:00.000Z'), ZONE)).toBe('01:30')
    expect(timeOfDay(meal('2026-10-24T23:30:00.000Z'), ZONE)).toBe('01:30')
  })
})

describe('the spring change — a 23-hour day', () => {
  it('is 23 hours long, midnight to midnight', () => {
    const start = zonedTimeToUtc(SPRING, '00:00', ZONE)
    const end = zonedTimeToUtc(addDays(SPRING, 1), '00:00', ZONE)
    expect(start).toBe('2027-03-25T22:00:00.000Z')
    expect(end).toBe('2027-03-26T21:00:00.000Z')
    expect(hoursBetween(start, end)).toBe(23)
  })

  it('turns a time that never happened into one that did, on the same day', () => {
    // 02:30 does not exist on the 26th. It must not throw, return an invalid
    // date, or slide to another day: it resolves forward to 03:30.
    const at = zonedTimeToUtc(SPRING, '02:30', ZONE)
    expect(Number.isNaN(Date.parse(at))).toBe(false)
    expect(dayKey(at, ZONE)).toBe(SPRING)
    expect(timeOfDay(meal(at), ZONE)).toBe('03:30')
  })

  it('puts the edges of the day on the right side of midnight', () => {
    expect(dayKey('2027-03-25T21:59:00.000Z', ZONE)).toBe('2027-03-25') // 23:59 winter time
    expect(dayKey('2027-03-25T22:00:00.000Z', ZONE)).toBe(SPRING) //        00:00
    expect(dayKey('2027-03-26T20:59:00.000Z', ZONE)).toBe(SPRING) //        23:59 summer time
    expect(dayKey('2027-03-26T21:00:00.000Z', ZONE)).toBe('2027-03-27') // 00:00
  })
})

describe('calendar arithmetic across a change', () => {
  it('steps one day at a time, never skipping or repeating one', () => {
    const autumn = [-2, -1, 0, 1, 2].map((n) => addDays(AUTUMN, n))
    expect(autumn).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
    const spring = [-2, -1, 0, 1, 2].map((n) => addDays(SPRING, n))
    expect(spring).toEqual(['2027-03-24', '2027-03-25', '2027-03-26', '2027-03-27', '2027-03-28'])
  })

  it('counts a day as a day, whatever its length', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2027-03-25', '2027-03-27')).toBe(2)
  })

  it('builds the week that contains each change as seven consecutive days', () => {
    expect(weekContaining(AUTUMN)).toEqual([
      '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
    ])
    expect(weekContaining(SPRING)).toEqual([
      '2027-03-21', '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', '2027-03-27',
    ])
  })
})

describe('repeating a day across a change', () => {
  const repeat = (source: Meal[], onDate: CalendarDate, now: string) =>
    repeatDay(source, 'user-dst' as UserId, {
      onDate,
      zone: ZONE,
      now: new Date(now),
      newId: (() => {
        let n = 0
        return () => `dst-${++n}`
      })(),
    }).meals

  it('copies a meal from the repeated hour to the same clock time the next day', () => {
    // Eaten at the SECOND 01:30 on the 25th; repeated onto the 26th.
    const [copy] = repeat([meal('2026-10-24T23:30:00.000Z')], '2026-10-26' as CalendarDate, '2026-10-26T10:00:00.000Z')
    expect(dayKey(copy.time.kind === 'instant' ? copy.time.at : '', ZONE)).toBe('2026-10-26')
    expect(timeOfDay(copy, ZONE)).toBe('01:30')
  })

  it('copies a 02:30 meal onto the day 02:30 never happens, without losing it', () => {
    // 02:30 on the 25th repeated onto the 26th: the copy lands at 03:30, on
    // the 26th, and — at noon — is not mistaken for something still to come.
    const source = meal('2027-03-25T00:30:00.000Z') // 02:30 winter time
    expect(timeOfDay(source, ZONE)).toBe('02:30')
    const copies = repeat([source], SPRING, '2027-03-26T09:00:00.000Z') // noon summer time
    expect(copies).toHaveLength(1)
    const at = copies[0].time.kind === 'instant' ? copies[0].time.at : ''
    expect(dayKey(at, ZONE)).toBe(SPRING)
    expect(timeOfDay(copies[0], ZONE)).toBe('03:30')
  })
})

function meal(at: string): Meal {
  return {
    id: `meal-${at}` as MealId,
    recordId: `meal-${at}-v1`,
    version: 1,
    userId: 'user-dst' as UserId,
    slot: 'SNACK',
    time: { kind: 'instant', at, zone: ZONE },
    items: [
      {
        id: `item-${at}` as Meal['items'][number]['id'],
        mealId: `meal-${at}` as MealId,
        name: 'Toast',
        amount: canonical(50, 'g'),
        nutrients: {
          energy: canonical(150, 'kcal'),
          protein: canonical(5, 'g'),
          carbs: canonical(25, 'g'),
          fat: canonical(3, 'g'),
        },
        provenance: userEntered(at),
      },
    ],
    provenance: userEntered(at),
  }
}

describe('every zone, all year', () => {
  /*
    The cases above are Israel's two nights. This sweeps two years of wall
    times in zones whose rules differ — the southern hemisphere changes the
    other way, India has no DST and a half-hour offset, Nepal a 45-minute one
    — and asks one question of each: does the instant read back as the wall
    time asked for, or, inside a spring gap only, as a time just after it on
    the same day?
  */
  const ZONES = ['Asia/Jerusalem', 'Europe/London', 'America/New_York', 'Australia/Sydney', 'Asia/Kolkata', 'Asia/Kathmandu']
  const wallTime = (instant: string, zone: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
      new Date(instant),
    )

  for (const zone of ZONES) {
    it(`round-trips in ${zone}`, () => {
      let gaps = 0
      for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2028, 0, 1); ms += 7 * 3_600_000) {
        const date = new Date(ms).toISOString().slice(0, 10) as CalendarDate
        const time = new Date(ms).toISOString().slice(11, 16)
        const at = zonedTimeToUtc(date, time, zone)
        expect(dayKey(at, zone), `${zone} ${date} ${time}`).toBe(date)
        if (wallTime(at, zone) !== time) {
          gaps += 1
          // Only a time that does not exist may move, and only forward by under two hours.
          const asked = Date.UTC(2000, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3)))
          const [h, m] = wallTime(at, zone).split(':').map(Number)
          const shift = Date.UTC(2000, 0, 1, h, m) - asked
          expect(shift, `${zone} ${date} ${time} → ${wallTime(at, zone)}`).toBeGreaterThan(0)
          expect(shift).toBeLessThanOrEqual(2 * 3_600_000)
        }
      }
      // No DST, no gaps — and a zone that has DST cannot have many.
      if (zone === 'Asia/Kolkata' || zone === 'Asia/Kathmandu') expect(gaps).toBe(0)
      else expect(gaps).toBeLessThanOrEqual(4)
    })
  }
})
