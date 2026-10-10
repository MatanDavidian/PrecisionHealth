import { describe, expect, it } from 'vitest'
import { currentPeriod, type SubscriptionRow } from '../../../supabase/functions/_shared/plan'
import { playManageUrl, playRow, playStatus } from '../../../supabase/functions/_shared/playState'

const NOW = new Date('2026-10-20T12:00:00.000Z')
const purchase = (state: string, expiry = '2026-11-15T09:00:00.000Z') => ({
  subscriptionState: state,
  startTime: '2026-10-15T09:00:00.000Z',
  lineItems: [{ productId: 'vimetry_monthly', expiryTime: expiry }],
})
const asRow = (token: string, p: ReturnType<typeof purchase>): SubscriptionRow => ({
  ...playRow(token, p), user_id: 'u', refunded_at: null, last_payment_at: null,
})

describe('Google Play states, in the plan’s words', () => {
  it.each([
    ['SUBSCRIPTION_STATE_ACTIVE', 'active'],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'past_due'],
    ['SUBSCRIPTION_STATE_ON_HOLD', 'unpaid'],
    ['SUBSCRIPTION_STATE_PAUSED', 'paused'],
    ['SUBSCRIPTION_STATE_CANCELED', 'cancelled'],
    ['SUBSCRIPTION_STATE_EXPIRED', 'expired'],
    ['SUBSCRIPTION_STATE_PENDING', 'pending'],
    ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'expired'],
    ['ACTIVE', 'active'],
    ['SOMETHING_NEW', 'unknown'],
  ])('%s → %s', (state, status) => expect(playStatus(state)).toBe(status))
})

describe('who has access, bought on Play', () => {
  it('active: this month, from the day it was bought', () => {
    const period = currentPeriod(asRow('t', purchase('SUBSCRIPTION_STATE_ACTIVE')), NOW)
    expect(period?.provider).toBe('google_play')
    expect(period?.start).toBe('2026-10-15T00:00:00.000Z')
    expect(period?.renews).toBe(true)
  })

  it('in the grace period: yes; on hold or pending: no', () => {
    expect(currentPeriod(asRow('t', purchase('SUBSCRIPTION_STATE_IN_GRACE_PERIOD')), NOW)).toBeDefined()
    expect(currentPeriod(asRow('t', purchase('SUBSCRIPTION_STATE_ON_HOLD')), NOW)).toBeUndefined()
    expect(currentPeriod(asRow('t', purchase('SUBSCRIPTION_STATE_PENDING')), NOW)).toBeUndefined()
  })

  it('cancelled: until the paid period’s end, then not', () => {
    const row = asRow('t', purchase('SUBSCRIPTION_STATE_CANCELED', '2026-11-15T09:00:00.000Z'))
    expect(currentPeriod(row, NOW)?.renews).toBe(false)
    expect(currentPeriod(row, new Date('2026-11-15T09:00:00.000Z'))).toBeUndefined()
  })

  it('a refund ends it at once', () => {
    const row = { ...asRow('t', purchase('SUBSCRIPTION_STATE_ACTIVE')), refunded_at: '2026-10-19T00:00:00.000Z' }
    expect(currentPeriod(row, NOW)).toBeUndefined()
  })
})

describe('the row', () => {
  it('keeps what entitlement needs, and marks test purchases', () => {
    const row = playRow('tok', { ...purchase('SUBSCRIPTION_STATE_ACTIVE'), testPurchase: {}, linkedPurchaseToken: 'old' })
    expect(row).toMatchObject({ id: 'tok', provider: 'google_play', billing_anchor: 15, test_mode: true,
      linked_purchase_token: 'old', renews_at: '2026-11-15T09:00:00.000Z', ends_at: null, variant_id: 'vimetry_monthly' })
  })

  it('manage links to Play’s own subscriptions page', () => {
    expect(playManageUrl('app.vimetry', 'vimetry_monthly'))
      .toBe('https://play.google.com/store/account/subscriptions?sku=vimetry_monthly&package=app.vimetry')
  })
})
