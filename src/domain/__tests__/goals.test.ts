import { describe, expect, it } from 'vitest'
import {
  canonical,
  convert,
  currentGoals,
  directionToward,
  goalFor,
  type Goal,
  type UserId,
} from '..'
import { userEntered } from '../provenance'

const USER = 'user-demo' as UserId

const goal = (overrides: Partial<Goal> & { recordedAt: string }): Goal => ({
  id: `goal-${overrides.recordedAt}` as Goal['id'],
  userId: USER,
  metric: 'WEIGHT',
  direction: 'AT_MOST',
  target: canonical(75, 'kg'),
  startsOn: '2026-08-01',
  active: true,
  ...overrides,
  provenance: userEntered(overrides.recordedAt),
})

describe('which goal is in force', () => {
  it('takes the newest for each metric', () => {
    // Changing a target appends rather than edits (D4), so several are live.
    const goals = [
      goal({ recordedAt: '2026-08-01T08:00:00.000Z', target: canonical(80, 'kg') }),
      goal({ recordedAt: '2026-08-20T08:00:00.000Z', target: canonical(75, 'kg') }),
    ]
    expect(currentGoals(goals)).toHaveLength(1)
    expect(convert(currentGoals(goals)[0].target, 'kg')).toBe(75)
  })

  it('breaks a same-day tie by the moment it was recorded', () => {
    // Set one, thought better of it, set another an hour later.
    const goals = [
      goal({ recordedAt: '2026-08-20T08:00:00.000Z', target: canonical(78, 'kg') }),
      goal({ recordedAt: '2026-08-20T09:00:00.000Z', target: canonical(74, 'kg') }),
    ]
    expect(convert(currentGoals(goals)[0].target, 'kg')).toBe(74)
  })

  it('keeps one goal per metric, not one overall', () => {
    const goals = [
      goal({ recordedAt: '2026-08-20T08:00:00.000Z' }),
      goal({ recordedAt: '2026-08-21T08:00:00.000Z', metric: 'PROTEIN', target: canonical(145, 'g') }),
    ]
    expect(currentGoals(goals).map((g) => g.metric).sort()).toEqual(['PROTEIN', 'WEIGHT'])
  })

  it('ignores inactive goals entirely', () => {
    const goals = [
      goal({ recordedAt: '2026-08-01T08:00:00.000Z', target: canonical(80, 'kg') }),
      goal({ recordedAt: '2026-08-20T08:00:00.000Z', target: canonical(75, 'kg'), active: false }),
    ]
    // The newest is switched off, so the older one stands rather than nothing.
    expect(convert(currentGoals(goals)[0].target, 'kg')).toBe(80)
  })

  it('finds nothing for a metric with no goal', () => {
    expect(goalFor([goal({ recordedAt: '2026-08-20T08:00:00.000Z' })], 'STEPS')).toBeUndefined()
  })
})

describe('which way a target is approached', () => {
  it('is a ceiling when losing and a floor when gaining', () => {
    // REACH would demand hitting the number to within a gram, which is why
    // this is derived rather than asked.
    expect(directionToward(80, 75)).toBe('AT_MOST')
    expect(directionToward(70, 75)).toBe('AT_LEAST')
  })

  it('treats already being there as attained, not as a ceiling to break', () => {
    expect(directionToward(75, 75)).toBe('AT_LEAST')
  })
})
