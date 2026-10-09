import { describe, expect, it } from 'vitest'
import {
  PLAN_ALLOWANCE,
  activePlan,
  currentPeriod,
  monthAround,
  type SubscriptionRow,
} from '../../../supabase/functions/_shared/plan'
import { allowanceOf } from '../plan'

const NOW = new Date('2026-10-09T12:00:00.000Z')

const sub = (fields: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 'sub-1',
  user_id: 'u',
  status: 'active',
  billing_anchor: 15,
  renews_at: '2026-10-15T08:00:00.000Z',
  ends_at: null,
  refunded_at: null,
  last_payment_at: '2026-09-15T08:00:00.000Z',
  source_created_at: '2026-08-15T08:00:00.000Z',
  ...fields,
})

describe('what the plan includes', () => {
  it('is 100 photos and 200 written analyses a month', () => {
    expect(PLAN_ALLOWANCE).toEqual({ PHOTO: 100, TEXT: 200 })
  })

  it('reports what is left, never below zero', () => {
    expect(allowanceOf('PHOTO', 37)).toEqual({ used: 37, allowance: 100, remaining: 63 })
    expect(allowanceOf('TEXT', 250).remaining).toBe(0)
  })
})

describe('the billing month', () => {
  it('runs from the anchor day to the anchor day', () => {
    const period = currentPeriod(sub(), NOW)
    expect(period?.start).toBe('2026-09-15T00:00:00.000Z')
    expect(period?.end).toBe('2026-10-15T00:00:00.000Z')
    expect(period?.renews).toBe(true)
  })

  it('turns over on the anchor day itself', () => {
    const period = currentPeriod(sub(), new Date('2026-10-15T00:00:00.000Z'))
    expect(period?.start).toBe('2026-10-15T00:00:00.000Z')
    expect(period?.end).toBe('2026-11-15T00:00:00.000Z')
  })

  it('crosses the year', () => {
    const { start, end } = monthAround(20, new Date('2027-01-05T00:00:00.000Z'))
    expect(start.toISOString()).toBe('2026-12-20T00:00:00.000Z')
    expect(end.toISOString()).toBe('2027-01-20T00:00:00.000Z')
  })

  it('bills the 31st on the last day of a shorter month, and back on the 31st after', () => {
    const feb = monthAround(31, new Date('2027-02-10T00:00:00.000Z'))
    expect(feb.start.toISOString()).toBe('2027-01-31T00:00:00.000Z')
    expect(feb.end.toISOString()).toBe('2027-02-28T00:00:00.000Z')
    const march = monthAround(31, new Date('2027-03-05T00:00:00.000Z'))
    expect(march.start.toISOString()).toBe('2027-02-28T00:00:00.000Z')
    expect(march.end.toISOString()).toBe('2027-03-31T00:00:00.000Z')
    expect(monthAround(31, new Date('2028-02-29T12:00:00.000Z')).start.toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  it('does not move while a payment is failing, though renews_at does', () => {
    // past_due: renews_at is the next RETRY. Following it would hand out a fresh month.
    const period = currentPeriod(sub({ status: 'past_due', renews_at: '2026-10-19T08:00:00.000Z' }), NOW)
    expect(period?.start).toBe('2026-09-15T00:00:00.000Z')
  })

  it('falls back to the day the subscription began when there is no anchor', () => {
    const period = currentPeriod(sub({ billing_anchor: null }), NOW)
    expect(period?.start).toBe('2026-09-15T00:00:00.000Z')
  })
})

describe('who has access', () => {
  it.each(['active', 'on_trial', 'past_due'])('%s: yes', (status) => {
    expect(currentPeriod(sub({ status }), NOW)).toBeDefined()
  })

  it.each(['expired', 'unpaid', 'paused', 'something-new'])('%s: no', (status) => {
    expect(currentPeriod(sub({ status }), NOW)).toBeUndefined()
  })

  it('cancelled: until the end of the paid month, and not a moment after', () => {
    const cancelled = sub({ status: 'cancelled', ends_at: '2026-10-15T08:00:00.000Z' })
    const period = currentPeriod(cancelled, NOW)
    expect(period?.renews).toBe(false)
    expect(period?.end).toBe('2026-10-15T00:00:00.000Z')
    expect(currentPeriod(cancelled, new Date('2026-10-15T08:00:00.000Z'))).toBeUndefined()
  })

  it('cancelled mid-month with an earlier end: access ends then', () => {
    const period = currentPeriod(sub({ status: 'cancelled', ends_at: '2026-10-10T00:00:00.000Z' }), NOW)
    expect(period?.end).toBe('2026-10-10T00:00:00.000Z')
  })

  it('refunded: none, at once, whatever the status says', () => {
    expect(currentPeriod(sub({ refunded_at: '2026-10-01T00:00:00.000Z' }), NOW)).toBeUndefined()
  })

  it('a payment after the refund restores it', () => {
    const repaid = sub({ refunded_at: '2026-10-01T00:00:00.000Z', last_payment_at: '2026-10-02T00:00:00.000Z' })
    expect(currentPeriod(repaid, NOW)).toBeDefined()
  })

  it('the newest subscription that gives access is the one that counts', () => {
    const old = sub({ id: 'old', status: 'expired', source_created_at: '2025-01-01T00:00:00.000Z' })
    const current = sub({ id: 'new', source_created_at: '2026-08-15T08:00:00.000Z' })
    expect(activePlan([old, current], NOW)?.subscriptionId).toBe('new')
    expect(activePlan([old], NOW)).toBeUndefined()
    expect(activePlan([], NOW)).toBeUndefined()
  })
})
