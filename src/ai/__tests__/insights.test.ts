import { describe, expect, it } from 'vitest'
import { validateInsight } from '../validate'
import { EstimateError } from '../estimator'
import { FakeEstimator } from '../fakeEstimator'
import { INSIGHTS_SYSTEM_PROMPT, insightsLanguageRule } from '../../../supabase/functions/_shared/prompt'
import type { WeekReport } from '@/domain'

const report: WeekReport = {
  from: '2026-08-23',
  to: '2026-08-29',
  days: [
    { day: '2026-08-23', weekday: 'Sunday', meals: [{ slot: 'LUNCH', foods: ['Rice'], kcal: 600, proteinG: 20, carbsG: 90, fatG: 10 }], eatenKcal: 600, burnedKcal: 2400 },
  ],
  totals: { comparedDays: 7, eatenAllDaysKcal: 17_890, daysWithFood: 7, eatenKcal: 17_890, burnedKcal: 16_980, netKcal: 910, daysWithBurn: 7, proteinG: 618 },
  goal: { objective: 'LOSE_WEIGHT', aimKcal: -3500, gapKcal: 4410, verdict: 'OFF_TARGET' },
}

describe('reading the model’s week reply', () => {
  const good = {
    summary: 'You ran a surplus.',
    observations: ['Protein averaged 88 g.', 'Saturday was 900 over.'],
    suggestions: ['Move a snack earlier.'],
    confidence: 0.7,
  }

  it('takes the shape as given', () => {
    const insight = validateInsight(good, 'm')
    expect(insight.summary).toBe('You ran a surplus.')
    expect(insight.observations).toHaveLength(2)
    expect(insight.confidence).toBe(0.7)
  })

  it('accepts an empty suggestions list as a real answer', () => {
    // "Nothing worth changing on this evidence" must be representable, or the
    // model is pushed into inventing advice.
    const insight = validateInsight({ ...good, suggestions: [] }, 'm')
    expect(insight.suggestions).toEqual([])
  })

  it('repairs a missing list rather than failing', () => {
    // Unlike an estimate: a thinner answer is not a corrupt one, and prose the
    // user reads and judges does not become indistinguishable from a
    // measurement the way a wrong number does.
    const { suggestions, ...withoutSuggestions } = good
    expect(validateInsight(withoutSuggestions, 'm').suggestions).toEqual([])
  })

  it('caps the lists, because a screen is not a report', () => {
    const many = {
      ...good,
      observations: Array.from({ length: 10 }, (_, i) => `obs ${i}`),
      suggestions: Array.from({ length: 10 }, (_, i) => `sug ${i}`),
    }
    const insight = validateInsight(many, 'm')
    expect(insight.observations).toHaveLength(6)
    expect(insight.suggestions).toHaveLength(4)
  })

  it('refuses a reply with nothing in it at all', () => {
    expect(() => validateInsight({ suggestions: ['do a thing'] }, 'm')).toThrow(EstimateError)
  })

  it('clamps a confidence the model got wrong', () => {
    expect(validateInsight({ ...good, confidence: 7 }, 'm').confidence).toBe(1)
    expect(validateInsight({ ...good, confidence: 'nonsense' }, 'm').confidence).toBe(0.5)
  })
})

describe('what the prompt insists on', () => {
  it('demands the numbers be quoted rather than described', () => {
    expect(INSIGHTS_SYSTEM_PROMPT).toContain('Quote the numbers')
  })

  it('makes an empty answer explicitly allowed', () => {
    expect(INSIGHTS_SYSTEM_PROMPT).toContain('An empty answer is a valid answer')
  })

  it('rules out the advice this app must never give', () => {
    for (const forbidden of ['Never diagnose', 'supplement', '1200']) {
      expect(INSIGHTS_SYSTEM_PROMPT).toContain(forbidden)
    }
  })

  it('tells the model it does not know who it is talking to', () => {
    expect(INSIGHTS_SYSTEM_PROMPT).toContain('Do not address the person by name')
  })

  it('asks for the reply in the reader’s language, keys untouched', () => {
    const rule = insightsLanguageRule('he')
    expect(rule).toContain('Reply in Hebrew')
    expect(rule).toContain('JSON keys')
    expect(insightsLanguageRule('en')).toBe('')
  })
})

describe('the fake reads the report it was handed', () => {
  it('quotes the real totals rather than inventing them', async () => {
    const insight = await new FakeEstimator().weekInsights(report, {})
    expect(insight.summary).toContain('17,890')
    expect(insight.observations.join(' ')).toContain('618')
  })

  it('says so, and suggests nothing, when the week is thin', async () => {
    const thin = { ...report, totals: { ...report.totals, daysWithBurn: 2 } }
    const insight = await new FakeEstimator().weekInsights(thin, {})
    expect(insight.summary).toContain('partial')
    expect(insight.suggestions).toEqual([])
    expect(insight.confidence).toBeLessThan(0.5)
  })
})
