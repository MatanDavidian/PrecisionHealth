import { describe, expect, it } from 'vitest'
import { dayKey, dayKeyOf } from '../time'

const JERUSALEM = 'Asia/Jerusalem'
const NEW_YORK = 'America/New_York'

describe('day identity', () => {
  it('puts a 01:00 local meal on the day that just started, not the one that ended', () => {
    // 01:00 on 18 Aug in Jerusalem (UTC+3) is 22:00 on 17 Aug UTC.
    expect(dayKey('2026-08-17T22:00:00.000Z', JERUSALEM)).toBe('2026-08-18')
  })

  it('does not let UTC decide the day', () => {
    // Same instant, two zones, two different local days — this is exactly why
    // the zone has to be stored with the record.
    const instant = '2026-08-17T22:00:00.000Z'
    expect(dayKey(instant, JERUSALEM)).toBe('2026-08-18')
    expect(dayKey(instant, NEW_YORK)).toBe('2026-08-17')
  })

  it('keeps a record in its original zone after the user moves', () => {
    // A meal eaten in New York stays on the New York day even if the profile
    // now says Jerusalem, because the zone travelled with the record.
    const eatenInNewYork = '2026-08-18T02:30:00.000Z' // 22:30 on the 17th in NY
    expect(dayKey(eatenInNewYork, NEW_YORK)).toBe('2026-08-17')
  })

  it('attributes sleep to the day you wake up', () => {
    const overnight = {
      kind: 'interval' as const,
      start: '2026-08-17T20:10:00.000Z', // 23:10 local, 17 Aug
      end: '2026-08-18T03:42:00.000Z', // 06:42 local, 18 Aug
      zone: JERUSALEM,
    }
    expect(dayKeyOf(overnight, 'END')).toBe('2026-08-18')
    expect(dayKeyOf(overnight, 'START')).toBe('2026-08-17')
  })

  it('handles a DST boundary without shifting the day', () => {
    // Israel leaves DST on 25 Oct 2026 at 02:00 local.
    expect(dayKey('2026-10-25T00:30:00.000Z', JERUSALEM)).toBe('2026-10-25')
  })
})
