import { describe, expect, it } from 'vitest'
import {
  DEVICE_ZONE_SENTINEL,
  keepRecentDays,
  MAX_DEVICE_SYNC_DAYS,
  resolveDeviceZone,
} from '../../../supabase/functions/_shared/deviceSync'

/**
 * The bug this file exists to have caught: after a real gap in syncing, some
 * of what the watch sent went missing, silently, with no error the watch
 * could show. Reproduced here without a watch, a phone, or a deploy.
 */
describe('what a real backlog looks like, and what survives', () => {
  /** Exactly what `Syncer.completedDays()` builds on a full 7-day backlog. */
  const fullBacklog = () => {
    const entries: { day: string; code: string; value: number }[] = []
    for (let d = 0; d < 7; d += 1) {
      // Oldest first here, as the server receives them — `Sync.mc` walks
      // getHistory() newest-first and pushes in that order, but the fixture
      // only needs distinct, orderable days; the assertions below check the
      // OUTCOME (which whole days survive), not the wire order.
      const day = `2026-09-${String(20 - d).padStart(2, '0')}`
      entries.push({ day, code: 'TOTAL_ENERGY', value: 2200 + d })
      entries.push({ day, code: 'STEPS', value: 8000 + d })
      entries.push({ day, code: 'DISTANCE', value: 5000 + d })
    }
    const today = '2026-09-21'
    entries.push({ day: today, code: 'STRESS', value: 24 })
    entries.push({ day: today, code: 'RESPIRATION_RATE', value: 14 })
    entries.push({ day: today, code: 'RESTING_HEART_RATE', value: 52 })
    entries.push({ day: today, code: 'VO2_MAX', value: 47 })
    return entries
  }

  it('reproduces the bug: the old entry-count slice loses today entirely', () => {
    // This is the exact expression device-sync used to run. Proof the new
    // tests below are testing something real, not a hypothetical.
    const OLD_MAX_DAYS = 14
    const oldResult = fullBacklog().slice(0, OLD_MAX_DAYS)
    expect(oldResult.some((e) => e.code === 'RESTING_HEART_RATE')).toBe(false)
    expect(oldResult.some((e) => e.code === 'VO2_MAX')).toBe(false)
    expect(oldResult.filter((e) => e.day === '2026-09-14').length).toBeLessThan(3)
  })

  it('keeps every reading from a real full backlog, today included', () => {
    const kept = keepRecentDays(fullBacklog(), MAX_DEVICE_SYNC_DAYS)
    expect(kept).toHaveLength(fullBacklog().length)
    // Specifically the four readings the old slice always dropped.
    for (const code of ['STRESS', 'RESPIRATION_RATE', 'RESTING_HEART_RATE', 'VO2_MAX']) {
      expect(kept.some((e) => e.day === '2026-09-21' && e.code === code)).toBe(true)
    }
    // And a full day of history, not two-thirds of one.
    const oldestDay = kept.filter((e) => e.day === '2026-09-14')
    expect(oldestDay).toHaveLength(3)
  })

  it('drops whole days, oldest first, never a day split across the cut', () => {
    const days = Array.from({ length: 20 }, (_, i) => ({
      day: `2026-08-${String(i + 1).padStart(2, '0')}`,
      code: 'TOTAL_ENERGY',
      value: 2000 + i,
    }))
    const kept = keepRecentDays(days, 5)
    const keptDays = [...new Set(kept.map((e) => e.day))].sort()
    expect(keptDays).toEqual(['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'])
    // Every kept day is whole; nothing between 1 and N-per-day survived.
    expect(kept).toHaveLength(5)
  })

  it('does nothing to a payload that was never near the old bug', () => {
    // Ordinary daily use: one unsent day, three readings. Miles under any cap.
    const ordinary = [
      { day: '2026-09-21', code: 'TOTAL_ENERGY', value: 2214 },
      { day: '2026-09-21', code: 'STEPS', value: 9412 },
      { day: '2026-09-21', code: 'DISTANCE', value: 6300 },
    ]
    expect(keepRecentDays(ordinary)).toEqual(ordinary)
  })
})

describe('resolving the zone a watch cannot name for itself', () => {
  it('uses the profile zone when the watch sends the sentinel', () => {
    expect(resolveDeviceZone(DEVICE_ZONE_SENTINEL, 'Asia/Jerusalem')).toBe('Asia/Jerusalem')
  })

  it('falls back to UTC when there is no profile to resolve against', () => {
    // Not a throw, and not silently storing the sentinel itself — "device" is
    // not a timezone, and code that later reads it (Intl.DateTimeFormat and
    // anything built on it) throws a RangeError on an unrecognised zone name.
    expect(resolveDeviceZone(DEVICE_ZONE_SENTINEL, undefined)).toBe('UTC')
    expect(resolveDeviceZone(DEVICE_ZONE_SENTINEL, '')).toBe('UTC')
  })

  it('never stores the literal sentinel as though it were a real zone', () => {
    // This is the bug: the old code accepted ANY string under 64 characters,
    // and "device" is one, so it was stored as the zone on every single
    // device-sourced observation without ever being resolved.
    expect(resolveDeviceZone(DEVICE_ZONE_SENTINEL, 'Asia/Jerusalem')).not.toBe('device')
  })

  it('trusts an explicit non-sentinel zone, for whatever future caller has one', () => {
    expect(resolveDeviceZone('Europe/London', 'Asia/Jerusalem')).toBe('Europe/London')
  })

  it('falls back to UTC on garbage rather than storing it', () => {
    expect(resolveDeviceZone(12345, 'Asia/Jerusalem')).toBe('UTC')
    expect(resolveDeviceZone(null, 'Asia/Jerusalem')).toBe('UTC')
    expect(resolveDeviceZone('x'.repeat(100), 'Asia/Jerusalem')).toBe('UTC')
  })
})
