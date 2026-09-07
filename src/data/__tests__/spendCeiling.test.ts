import { describe, expect, it } from 'vitest'
import {
  dailyBudgetMicros,
  DEFAULT_DAILY_BUDGET_MICROS,
} from '../../../supabase/functions/_shared/prompt'

/**
 * The ceiling that stops a day running away.
 *
 * The per-user trial bounds what one person costs and bounds nothing in
 * total — sign-up is open, so the exposure was (accounts × ten analyses) with
 * no upper limit. The parsing below is the whole of the configuration surface,
 * and every way it can be wrong ends with someone's card.
 */
describe('reading the daily budget', () => {
  it('uses the default when nothing is configured', () => {
    expect(dailyBudgetMicros(undefined)).toBe(DEFAULT_DAILY_BUDGET_MICROS)
    expect(dailyBudgetMicros('')).toBe(DEFAULT_DAILY_BUDGET_MICROS)
  })

  it('takes a configured ceiling', () => {
    expect(dailyBudgetMicros('2500000')).toBe(2_500_000)
  })

  it('refuses to read nonsense as "no ceiling"', () => {
    // The failure that matters: a typo in a secret must not remove the limit.
    for (const bad of ['banana', 'NaN', 'Infinity', '-1', '0', '  ']) {
      expect(dailyBudgetMicros(bad), `${bad} should fall back`).toBe(
        DEFAULT_DAILY_BUDGET_MICROS,
      )
    }
  })

  it('is a whole number of micros', () => {
    // Fractions of a micro are not money, and Postgres stores a bigint.
    expect(dailyBudgetMicros('1234.9')).toBe(1234)
    expect(Number.isInteger(dailyBudgetMicros('999.99'))).toBe(true)
  })

  it('defaults to something a full trial cannot reach on its own', () => {
    // Sol is about $0.11 an analysis and a trial is ten, so roughly a dollar a
    // head. The ceiling must be invisible to real early use and decisive in
    // abnormal use — a day that turns a handful of people away is a bug.
    const oneFullTrialMicros = 1_100_000
    expect(DEFAULT_DAILY_BUDGET_MICROS).toBeGreaterThan(oneFullTrialMicros * 5)
  })
})
