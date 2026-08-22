import { describe, expect, it } from 'vitest'
import { computeTrialStatus } from '../trial'
import { MODEL_SOL, MODEL_TERRA } from '../../../supabase/functions/_shared/prompt'

describe('what the trial offers next', () => {
  it('opens on the most accurate model', () => {
    const status = computeTrialStatus(0, 0)
    expect(status.suggestedModel).toBe(MODEL_SOL)
    expect(status.pastNudge).toBe(false)
    expect(status.solRemaining).toBe(4)
  })

  it('still suggests the best model for the second photo', () => {
    // The first impression is worth two analyses, not one.
    expect(computeTrialStatus(1, 1).suggestedModel).toBe(MODEL_SOL)
    expect(computeTrialStatus(1, 1).pastNudge).toBe(false)
  })

  it('moves itself to the faster model after two, and says so', () => {
    const status = computeTrialStatus(2, 2)
    expect(status.suggestedModel).toBe(MODEL_TERRA)
    // pastNudge is what triggers the one-time "switched" notice.
    expect(status.pastNudge).toBe(true)
    // But two of the best remain, deliberately: the switch is an offer, not a
    // wall, and they are there for a meal that deserves them.
    expect(status.solRemaining).toBe(2)
  })

  it('keeps the best model available until its budget is actually spent', () => {
    expect(computeTrialStatus(3, 3).solRemaining).toBe(1)
    expect(computeTrialStatus(4, 4).solRemaining).toBe(0)
  })

  it('locks the best model once its budget is gone', () => {
    const status = computeTrialStatus(5, 4)
    expect(status.solRemaining).toBe(0)
    expect(status.suggestedModel).toBe(MODEL_TERRA)
    // The trial itself is far from over — only the expensive part of it is.
    expect(status.exhausted).toBe(false)
    expect(status.remaining).toBe(5)
  })

  it('spends the sol budget only as fast as sol is actually used', () => {
    // Someone who switches to the fast model early keeps their best analyses.
    const status = computeTrialStatus(8, 1)
    expect(status.solRemaining).toBe(3)
    expect(status.remaining).toBe(2)
  })

  it('ends the trial after ten analyses regardless of model', () => {
    const status = computeTrialStatus(10, 4)
    expect(status.exhausted).toBe(true)
    expect(status.remaining).toBe(0)
  })

  it('never reports negative allowances, however the ledger reads', () => {
    const status = computeTrialStatus(12, 6)
    expect(status.remaining).toBe(0)
    expect(status.solRemaining).toBe(0)
  })
})
