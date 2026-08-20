import { describe, expect, it } from 'vitest'
import { detectConflict, resolveEffective, type Provenance } from '../provenance'

const record = (id: string, provenance: Provenance, value: number) => ({ id, provenance, value })

const at = (iso: string) => iso

describe('precedence', () => {
  it('prefers a user-confirmed value over a device reading', () => {
    const candidates = [
      record('a', { source: 'GARMIN', kind: 'RAW', recordedAt: at('2026-08-18T06:00:00Z') }, 72.8),
      record('b', { source: 'USER', kind: 'USER_CONFIRMED', recordedAt: at('2026-08-18T05:00:00Z') }, 73.5),
    ]
    // Confirmed wins even though the device reading is newer.
    expect(resolveEffective(candidates)?.id).toBe('b')
  })

  it('prefers a device reading over an AI estimate', () => {
    const candidates = [
      record('ai', { source: 'AI_ESTIMATE', kind: 'DERIVED', recordedAt: at('2026-08-18T09:00:00Z'), confidence: 0.9 }, 180),
      record('dev', { source: 'GARMIN', kind: 'RAW', recordedAt: at('2026-08-18T08:00:00Z') }, 170),
    ]
    expect(resolveEffective(candidates)?.id).toBe('dev')
  })

  it('breaks ties by recency within the same rank', () => {
    const candidates = [
      record('old', { source: 'GARMIN', kind: 'RAW', recordedAt: at('2026-08-18T06:00:00Z') }, 1),
      record('new', { source: 'GARMIN', kind: 'RAW', recordedAt: at('2026-08-18T07:00:00Z') }, 2),
    ]
    expect(resolveEffective(candidates)?.id).toBe('new')
  })

  it('ignores records that have been superseded', () => {
    const candidates = [
      record('original', { source: 'USER', kind: 'USER_CONFIRMED', recordedAt: at('2026-08-18T06:00:00Z') }, 100),
      record('correction', {
        source: 'USER',
        kind: 'USER_CONFIRMED',
        recordedAt: at('2026-08-18T07:00:00Z'),
        supersedes: ['original'],
      }, 120),
    ]
    expect(resolveEffective(candidates)?.id).toBe('correction')
  })

  it('returns nothing when there is nothing to resolve', () => {
    expect(resolveEffective([])).toBeUndefined()
  })
})

describe('conflict detection', () => {
  const byValue = (r: { value: number }) => r.value

  it('stays quiet when sources agree within tolerance', () => {
    const candidates = [
      record('a', { source: 'SMART_SCALE', kind: 'RAW', recordedAt: at('2026-08-18T06:00:00Z') }, 72800),
      record('b', { source: 'GARMIN', kind: 'RAW', recordedAt: at('2026-08-18T06:05:00Z') }, 72900),
    ]
    expect(detectConflict(candidates, byValue, 200)).toBeUndefined()
  })

  it('raises a conflict when the gap exceeds tolerance', () => {
    const candidates = [
      record('scale', { source: 'SMART_SCALE', kind: 'RAW', recordedAt: at('2026-08-18T06:00:00Z') }, 72800),
      record('phone', { source: 'APPLE_HEALTH', kind: 'RAW', recordedAt: at('2026-08-18T07:00:00Z') }, 73700),
    ]
    const conflict = detectConflict(candidates, byValue, 200)
    expect(conflict?.effective.id).toBe('scale') // higher source rank
    expect(conflict?.competing.map((c) => c.id)).toEqual(['phone'])
    expect(conflict?.spread).toBe(900)
  })

  it('never raises a conflict from a single source', () => {
    const only = [record('a', { source: 'GARMIN', kind: 'RAW', recordedAt: at('2026-08-18T06:00:00Z') }, 1)]
    expect(detectConflict(only, byValue, 0)).toBeUndefined()
  })
})
