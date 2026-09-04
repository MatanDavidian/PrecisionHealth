import { describe, expect, it } from 'vitest'
import { isGranted, outstanding, REQUIRED, type ConsentRecord } from '../consent'
import { DOCUMENTS, documentText, isDraft, PRIVACY_POLICY, TERMS } from '@/policy/documents'

const record = (over: Partial<ConsentRecord>): ConsentRecord => ({
  subject: 'PRIVACY',
  version: PRIVACY_POLICY.version,
  action: 'GRANTED',
  recordedAt: '2026-09-04T08:00:00.000Z',
  ...over,
})

describe('what someone has agreed to', () => {
  it('counts a grant for the current version', () => {
    expect(isGranted([record({})], PRIVACY_POLICY)).toBe(true)
  })

  it('does not count a grant for an older version', () => {
    // A changed policy is a new question, not a formality — which is the whole
    // reason the version is in the record rather than a boolean.
    expect(isGranted([record({ version: '2020-01-01' })], PRIVACY_POLICY)).toBe(false)
  })

  it('lets a withdrawal win, because it is appended and not deleted', () => {
    const history = [
      record({ recordedAt: '2026-09-04T08:00:00.000Z' }),
      record({ action: 'WITHDRAWN', recordedAt: '2026-09-05T08:00:00.000Z' }),
    ]
    expect(isGranted(history, PRIVACY_POLICY)).toBe(false)
  })

  it('lets someone agree again after withdrawing', () => {
    const history = [
      record({ recordedAt: '2026-09-04T08:00:00.000Z' }),
      record({ action: 'WITHDRAWN', recordedAt: '2026-09-05T08:00:00.000Z' }),
      record({ recordedAt: '2026-09-06T08:00:00.000Z' }),
    ]
    expect(isGranted(history, PRIVACY_POLICY)).toBe(true)
  })

  it('keeps the two documents separate, as consent law requires', () => {
    // Agreeing to a contract is not consenting to health-data processing;
    // bundling them is exactly what Art. 7(4) is about.
    const onlyPrivacy = [record({})]
    expect(outstanding(onlyPrivacy).map((d) => d.id)).toEqual(['TERMS'])
  })

  it('asks for everything when nothing has been agreed to', () => {
    expect(outstanding([]).map((d) => d.id)).toEqual(REQUIRED)
  })
})

describe('the documents themselves', () => {
  it('fingerprints the words, not the label', () => {
    // Two documents with the same version but different text must not produce
    // the same evidence.
    const edited = {
      ...PRIVACY_POLICY,
      sections: [...PRIVACY_POLICY.sections, { heading: 'Extra', body: ['Something new.'] }],
    }
    expect(documentText(edited)).not.toBe(documentText(PRIVACY_POLICY))
  })

  it('knows it is still a draft', () => {
    // Both are, today. When the last UNDECIDED marker goes, this test is what
    // says so out loud rather than letting a draft ship looking finished.
    expect(isDraft(PRIVACY_POLICY)).toBe(true)
    expect(isDraft(TERMS)).toBe(true)
  })

  it('never leaves a placeholder reading like an answer', () => {
    for (const document of Object.values(DOCUMENTS)) {
      for (const marker of documentText(document).match(/\[UNDECIDED:[^\]]*\]/g) ?? []) {
        // Every one has to say what is undecided, or it is just a blank.
        expect(marker.length).toBeGreaterThan('[UNDECIDED: ]'.length + 4)
      }
    }
  })

  it('says what the code actually does about photographs', () => {
    // The claim most likely to be wrong later, and the one users care about
    // most. If photo storage is ever added, this fails and the policy has to
    // be rewritten in the same commit.
    const text = documentText(PRIVACY_POLICY)
    expect(text).toMatch(/photograph is sent for analysis once and then discarded/i)
    expect(text).toMatch(/not given your name, your email, or any identifier/i)
  })

  it('names every processor, because "we use third parties" is not a disclosure', () => {
    const text = documentText(PRIVACY_POLICY)
    for (const processor of ['Supabase', 'OpenAI', 'Cloudflare']) {
      expect(text).toContain(processor)
    }
  })
})
