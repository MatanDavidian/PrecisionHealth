/**
 * Looking a string up and filling it in.
 *
 * Deliberately free of React and of the data layer, so the interesting part —
 * placeholder substitution, plural selection, which language a browser wants —
 * can be tested without a store, a DOM or a rendered tree. The provider in
 * `index.tsx` is the thin part that holds the choice.
 */
import { STRINGS, type Dictionary, type Lang, type Plural, type StringKey } from './strings'

/**
 * Which language to open in, before anyone has chosen.
 *
 * A Hebrew speaker's browser already says so; asking them to find a setting in
 * a language they did not pick is a poor first screen. An explicit choice
 * always wins over this, and is remembered per device.
 */
export function detectLanguage(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const tags = [navigator.language, ...(navigator.languages ?? [])]
  return tags.some((tag) => tag?.toLowerCase().startsWith('he')) ? 'he' : 'en'
}

const isPlural = (value: string | Plural): value is Plural =>
  typeof value === 'object' && value !== null && 'one' in value

/** Fills `{name}` holes. Anything unmatched is left visible rather than blanked. */
const fill = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  )

export type Translate = (key: StringKey, params?: Record<string, string | number>) => string

/**
 * Falls back to English for a key the chosen language somehow lacks — which
 * the types make impossible today, but a dictionary loaded at runtime later
 * would not, and a missing word should never blank a screen.
 */
export function translator(lang: Lang): Translate {
  const dictionary: Dictionary = STRINGS[lang]
  return (key, params = {}) => {
    const entry = dictionary[key] ?? STRINGS.en[key]
    if (entry === undefined) return key
    const template = isPlural(entry)
      ? Number(params.count) === 1
        ? entry.one
        : entry.other
      : entry
    return fill(template, params)
  }
}
