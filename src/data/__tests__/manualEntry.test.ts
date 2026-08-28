import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { buildGoal, buildObservation, instantOn } from '../newRecords'
import { convert, dayKey, needsConfirmation, type UserId } from '@/domain'

const USER = 'user-demo' as UserId
const ZONE = 'Asia/Jerusalem'

describe('a measurement typed by hand', () => {
  it('is a plain user entry, needing no confirmation', () => {
    const o = buildObservation(USER, { code: 'WEIGHT', value: 79.4, unit: 'kg', day: '2026-08-20' }, ZONE)
    expect(o.provenance.source).toBe('USER')
    expect(needsConfirmation(o.provenance)).toBe(false)
  })

  it('converts at the edge, storing canonical units (D8)', () => {
    const o = buildObservation(USER, { code: 'WEIGHT', value: 79.4, unit: 'kg', day: '2026-08-20' }, ZONE)
    // Mass is grams underneath, whatever the user typed.
    expect(o.value.value).toBe(79_400)
    expect(convert(o.value, 'kg')).toBeCloseTo(79.4, 5)
  })

  it('lands on the day it was recorded for, not the day it was typed', () => {
    const o = buildObservation(USER, { code: 'ACTIVE_ENERGY', value: 2480, unit: 'kcal', day: '2026-08-18' }, ZONE)
    expect(o.time.kind).toBe('instant')
    if (o.time.kind !== 'instant') throw new Error('expected an instant')
    expect(dayKey(o.time.at, ZONE)).toBe('2026-08-18')
    // And keeps the zone it was made in, so it never drifts (D7).
    expect(o.time.zone).toBe(ZONE)
  })

  it('stamps a past day at midday, far from either boundary', () => {
    const at = instantOn('2026-08-18', ZONE)
    expect(dayKey(at, ZONE)).toBe('2026-08-18')
    // Twelve hours of slack each way: nothing short of changing timezone can
    // push it onto a neighbouring date.
    const shifted = (hours: number) =>
      dayKey(new Date(Date.parse(at) + hours * 3_600_000).toISOString(), ZONE)
    expect(shifted(-11)).toBe('2026-08-18')
    expect(shifted(+11)).toBe('2026-08-18')
  })

  it('is read back through the zone it was made in, not the reader’s', () => {
    // No instant shares a date worldwide — the globe spans 26 hours of clock —
    // which is exactly why an observation carries its own zone (D7).
    const o = buildObservation(USER, { code: 'WEIGHT', value: 80, unit: 'kg', day: '2026-08-18' }, ZONE)
    if (o.time.kind !== 'instant') throw new Error('expected an instant')
    expect(dayKey(o.time.at, o.time.zone)).toBe('2026-08-18')
  })

  it('stamps today with the actual time, because that is when it happened', () => {
    const today = dayKey(new Date().toISOString(), ZONE)
    const at = instantOn(today, ZONE)
    expect(Math.abs(Date.parse(at) - Date.now())).toBeLessThan(5000)
  })
})

describe('a goal the user set', () => {
  it('records the target in canonical units and stays active', () => {
    const g = buildGoal(USER, { metric: 'WEIGHT', target: 75, unit: 'kg', direction: 'AT_MOST' }, ZONE)
    expect(convert(g.target, 'kg')).toBe(75)
    expect(g.active).toBe(true)
    expect(g.provenance.source).toBe('USER')
  })

  it('starts today, because a goal set now did not apply retroactively', () => {
    const g = buildGoal(USER, { metric: 'WEIGHT', target: 75, unit: 'kg', direction: 'AT_MOST' }, ZONE)
    expect(g.startsOn).toBe(dayKey(new Date().toISOString(), ZONE))
  })

  it('gets a fresh id each time, so setting a new target appends', () => {
    const a = buildGoal(USER, { metric: 'WEIGHT', target: 75, unit: 'kg', direction: 'AT_MOST' }, ZONE)
    const b = buildGoal(USER, { metric: 'WEIGHT', target: 74, unit: 'kg', direction: 'AT_MOST' }, ZONE)
    expect(a.id).not.toBe(b.id)
  })
})
