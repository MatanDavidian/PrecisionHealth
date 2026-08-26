import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECENT_DESCRIPTIONS,
  forgetDescription,
  readRecentDescriptions,
  rememberDescription,
} from '../descriptions'

/** jsdom is not configured for this project, so localStorage is stood up here. */
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
})

describe('the sentences you have used before', () => {
  it('offers the newest first', () => {
    rememberDescription('porridge with honey')
    rememberDescription('two eggs on toast')
    expect(readRecentDescriptions()).toEqual(['two eggs on toast', 'porridge with honey'])
  })

  it('does not list the same meal twice for a stray capital or space', () => {
    rememberDescription('Two eggs on toast')
    rememberDescription('two  eggs on toast')
    // One entry, and it is what was typed most recently.
    expect(readRecentDescriptions()).toEqual(['two  eggs on toast'])
  })

  it('keeps only the last few, so it stays a row of chips', () => {
    for (let i = 0; i < RECENT_DESCRIPTIONS + 4; i++) rememberDescription(`meal ${i}`)
    expect(readRecentDescriptions()).toHaveLength(RECENT_DESCRIPTIONS)
    expect(readRecentDescriptions()[0]).toBe(`meal ${RECENT_DESCRIPTIONS + 3}`)
  })

  it('ignores an empty description rather than storing a blank chip', () => {
    rememberDescription('an apple')
    rememberDescription('   ')
    expect(readRecentDescriptions()).toEqual(['an apple'])
  })

  it('forgets one on request', () => {
    rememberDescription('an apple')
    rememberDescription('a banana')
    expect(forgetDescription('AN APPLE')).toEqual(['a banana'])
  })

  it('survives storage that is unavailable or holding rubbish', () => {
    store.set('recent-descriptions', 'not json')
    expect(readRecentDescriptions()).toEqual([])

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readRecentDescriptions()).toEqual([])
    expect(() => rememberDescription('an apple')).not.toThrow()
  })
})
