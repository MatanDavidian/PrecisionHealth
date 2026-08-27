import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getRepositories } from '@/data'
import { DIRECTION, type Lang } from './strings'
import { detectLanguage, translator, type Translate } from './translate'

export { LANGUAGES, DIRECTION, type Lang } from './strings'
export { detectLanguage, translator, type Translate } from './translate'

interface LanguageContextValue {
  lang: Lang
  dir: 'ltr' | 'rtl'
  t: Translate
  setLang: (next: Lang) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  dir: 'ltr',
  t: translator('en'),
  setLang: () => {},
})

export const useLang = () => useContext(LanguageContext)
/** The common case: a component only wants the words. */
export const useT = (): Translate => useContext(LanguageContext).t

/**
 * The chosen language, and the direction that follows from it.
 *
 * Stored in settings, which are device-local and deliberately excluded from
 * sync (D14, Q8) — the right home for a preference about this screen rather
 * than a fact about this person's health.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLanguage)

  useEffect(() => {
    void getRepositories()
      .settings.get()
      .then((settings) => {
        if (settings.language) setLangState(settings.language)
      })
      .catch(() => undefined)
  }, [])

  // The document itself has to know, or the browser cannot mirror the layout,
  // pick the right quotation marks, or hyphenate correctly.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = DIRECTION[lang]
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    void getRepositories().settings.save({ language: next }).catch(() => undefined)
  }, [])

  const value = useMemo(
    () => ({ lang, dir: DIRECTION[lang], t: translator(lang), setLang }),
    [lang, setLang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
