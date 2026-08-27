import { describe, expect, it } from 'vitest'
import { translator, detectLanguage } from '../translate'
import { DIRECTION, STRINGS, type Lang } from '../strings'

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
