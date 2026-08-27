import { describe, expect, it } from 'vitest'
import { translator, detectLanguage } from '../translate'
import { DIRECTION, STRINGS, type Lang } from '../strings'
import { decideLanguage } from '../reconcile'

const langs: Lang[] = ['en', 'he']

describe('the dictionary', () => {
  it('says the same things in both languages', () => {
    // The types enforce this at build time; asserting it too catches a
    // dictionary loaded some other way later.
    expect(Object.keys(STRINGS.he).sort()).toEqual(Object.keys(STRINGS.en).sort())
  })

  it('leaves nothing blank', () => {
    for (const lang of langs) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        const text = typeof value === 'string' ? value : `${value.one}${value.other}`
        expect(text.trim(), `${lang}:${key}`).not.toBe('')
      }
    }
  })

  it('keeps every placeholder its English original has', () => {
    const holes = (v: string | { one: string; other: string }) =>
      [...(typeof v === 'string' ? v : v.other).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      // A translation that drops {count} renders "meals" with no number.
      expect(holes(STRINGS.he[key]), key).toEqual(holes(STRINGS.en[key]))
    }
  })

  it('runs Hebrew right to left and English left to right', () => {
    expect(DIRECTION.he).toBe('rtl')
    expect(DIRECTION.en).toBe('ltr')
  })
})

describe('translating', () => {
  it('fills placeholders', () => {
    expect(translator('en')('usuals.forSlot', { slot: 'breakfast' })).toBe('Usual for breakfast')
  })

  it('picks singular and plural by count', () => {
    const t = translator('en')
    expect(t('usuals.mealCount', { count: 1 })).toBe('1 meal')
    expect(t('usuals.mealCount', { count: 3 })).toBe('3 meals')
  })

  it('picks the Hebrew plural, which differs in wording not just in number', () => {
    const t = translator('he')
    expect(t('when.weeksAgo', { count: 1 })).toBe('לפני שבוע')
    expect(t('when.weeksAgo', { count: 3 })).toBe('לפני 3 שבועות')
  })

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    // Silently swallowing it would hide the bug; showing it makes it obvious.
    expect(translator('en')('usuals.forSlot', {})).toBe('Usual for {slot}')
  })

  it('answers in Hebrew when asked in Hebrew', () => {
    expect(translator('he')('nav.settings')).toBe('הגדרות')
  })
})

describe('choosing a language before anyone has', () => {
  const withNavigator = (languages: string[]) => {
    const original = globalThis.navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: languages[0], languages },
      configurable: true,
    })
    try {
      return detectLanguage()
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true })
    }
  }

  it('follows a Hebrew browser', () => {
    expect(withNavigator(['he-IL', 'en-US'])).toBe('he')
  })

  it('falls back to English for anything else', () => {
    expect(withNavigator(['fr-FR'])).toBe('en')
  })

  it('notices Hebrew even when it is not the first preference', () => {
    expect(withNavigator(['en-US', 'he'])).toBe('he')
  })
})

describe('reconciling the device and the account', () => {
  it('leaves a signed-out user to their device, and asks nothing', () => {
    // There would be nowhere to keep the answer.
    expect(decideLanguage({ authenticated: false, onDevice: 'he', reachable: true })).toEqual({
      use: 'he',
      ask: false,
    })
    expect(decideLanguage({ authenticated: false, reachable: true }).ask).toBe(false)
  })

  it('lets the account win, and brings the device back into step', () => {
    expect(
      decideLanguage({ authenticated: true, onAccount: 'he', onDevice: 'en', reachable: true }),
    ).toEqual({ use: 'he', saveToDevice: 'he', ask: false })
  })

  it('writes nothing when the two already agree', () => {
    const d = decideLanguage({
      authenticated: true,
      onAccount: 'he',
      onDevice: 'he',
      reachable: true,
    })
    expect(d.saveToDevice).toBeUndefined()
    expect(d.ask).toBe(false)
  })

  it('carries a device choice up rather than asking again', () => {
    // Someone who set this before signing in has already answered.
    expect(decideLanguage({ authenticated: true, onDevice: 'he', reachable: true })).toEqual({
      use: 'he',
      saveToAccount: 'he',
      ask: false,
    })
  })

  it('asks only when neither knows', () => {
    expect(decideLanguage({ authenticated: true, reachable: true })).toEqual({ ask: true })
  })

  it('stays quiet when the account could not be read', () => {
    // "We could not reach it" is not "they have not chosen" — treating the two
    // the same would nag on every flaky connection.
    expect(decideLanguage({ authenticated: true, reachable: false })).toEqual({ ask: false })
  })

  it('never asks when something is already set, reachable or not', () => {
    expect(decideLanguage({ authenticated: true, onDevice: 'en', reachable: false }).ask).toBe(false)
    expect(decideLanguage({ authenticated: true, onAccount: 'en', reachable: false }).ask).toBe(false)
  })
})
