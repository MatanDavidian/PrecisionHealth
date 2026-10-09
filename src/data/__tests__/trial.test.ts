import { describe, expect, it } from 'vitest'
import { computeTrialStatus } from '../trial'
import { MODEL_SOL, TRIAL_MODEL } from '../../../supabase/functions/_shared/prompt'

describe('what the trial offers', () => {
  it('opens on the most accurate model', () => {
    expect(TRIAL_MODEL).toBe(MODEL_SOL)
    expect(computeTrialStatus(0).suggestedModel).toBe(MODEL_SOL)
  })

  it('stays on it for every analysis — there is no separate budget to run out', () => {
    for (let used = 0; used < 10; used++) expect(computeTrialStatus(used).suggestedModel).toBe(MODEL_SOL)
  })

  it('counts down the ten', () => {
    const status = computeTrialStatus(3)
    expect(status.remaining).toBe(7)
    expect(status.exhausted).toBe(false)
  })

  it('ends the trial after ten analyses', () => {
    const status = computeTrialStatus(10)
    expect(status.exhausted).toBe(true)
    expect(status.remaining).toBe(0)
  })

  it('never reports a negative allowance, however the ledger reads', () => {
    expect(computeTrialStatus(12).remaining).toBe(0)
  })
})
