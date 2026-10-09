import { describe, expect, it } from 'vitest'
import {
  ASSUMED_ANALYSIS_MICROS,
  MODEL_RATES,
  TRIAL_MODELS,
  costMicros,
} from '../../../supabase/functions/_shared/prompt'

/**
 * Every model the server may run has a price.
 *
 * The ledger books each analysis at its measured cost, and the daily spend
 * ceiling adds those up. A model without a rate used to cost 0 — invisible to
 * the ceiling — which is exactly the mistake adding a new model would make.
 */
describe('model prices', () => {
  it('has a rate for every model the server allows', () => {
    for (const model of TRIAL_MODELS) expect(MODEL_RATES[model], model).toBeDefined()
  })

  it('books an unpriced model at the assumed worst case, never at zero', () => {
    expect(costMicros('a-model-nobody-priced', 1000, 1000)).toBe(ASSUMED_ANALYSIS_MICROS)
  })

  it('books a priced model at its measured cost', () => {
    const [model] = TRIAL_MODELS
    const rate = MODEL_RATES[model]
    expect(costMicros(model, 1_000_000, 0)).toBe(Math.round(1_000_000 * rate.input))
  })
})
