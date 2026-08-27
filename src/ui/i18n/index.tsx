import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getRepositories } from '@/data'
import {
  readAccountLanguage,
  saveAccountLanguage,
  type AccountLanguage,
} from '@/data/accountPreferences'
import { getSession, subscribeToSession, type Session } from '@/data/session'
import { DIRECTION, type Lang } from './strings'
import { detectLanguage, translator, type Translate } from './translate'
import { decideLanguage } from './reconcile'

export { LANGUAGES, DIRECTION, type Lang } from './strings'
export { detectLanguage, translator, type Translate } from './translate'

interface LanguageContextValue {
  lang: Lang
  dir: 'ltr' | 'rtl'
  t: Translate
  setLang: (next: Lang) => void
  /**
   * True when a signed-in account has never chosen, so the app should ask.
   *
   * Distinct from "is currently English". Someone browsing in English because
   * that is what their browser reports has not chosen anything, and is exactly
   * who this is for.
   */
  needsChoice: boolean
  /** Dismisses the prompt for this session without recording a choice. */
  postponeChoice: () => void
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  dir: 'ltr',
  t: translator('en'),
  setLang: () => {},
  needsChoice: false,
  postponeChoice: () => {},
})

export const useLang = () => useContext(LanguageContext)
/** The common case: a component only wants the words. */
export const useT = (): Translate => useContext(LanguageContext).t

/**
 * The chosen language, and the direction that follows from it.
 *
 * Two homes, on purpose. The DEVICE keeps a copy in local settings, which is
 * what makes the app work signed out, work offline, and switch the instant you
 * tap. The ACCOUNT keeps the real preference, because someone who reads Hebrew
 * reads Hebrew on their laptop too, and finding the setting again on every
 * device is the kind of small insult that makes an app feel unfinished.
 *
 * The account wins when the two disagree, since it is the one the person
 * actually chose; the device copy is a cache that also happens to work alone.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLanguage)
  const [needsChoice, setNeedsChoice] = useState(false)
  const [postponed, setPostponed] = useState(false)
  const session = useRef<Session>()
  /**
   * Who was last reconciled.
   *
   * Supabase announces a session more than once on load — an initial event and
   * a signed-in one — and each announcement would otherwise re-read the
   * preference. Same user, same answer; the work is skipped.
   */
  const reconciled = useRef<string>()

  /** What this device last used, whether or not anyone chose it deliberately. */
  const deviceLanguage = async () => (await getRepositories().settings.get()).language

  useEffect(() => {
    let cancelled = false

    /**
     * Reconciles the two homes whenever the session changes.
     *
     * The rules live in `decideLanguage`; this only carries them out.
     */
    async function reconcile(current: Session) {
      session.current = current
      const who = current.authenticated ? `user:${current.userId}` : 'local'
      if (reconciled.current === who) return
      reconciled.current = who
      const onDevice = await deviceLanguage()
      if (cancelled) return

      const account = current.authenticated
        ? await readAccountLanguage(current.userId)
        : ({ known: true } as AccountLanguage)
      if (cancelled) return

      const decision = decideLanguage({
        authenticated: current.authenticated,
        onAccount: account.known ? account.language : undefined,
        onDevice,
        reachable: account.known,
      })
      if (decision.use) setLangState(decision.use)
      if (decision.saveToDevice) {
        void getRepositories()
          .settings.save({ language: decision.saveToDevice })
          .catch(() => undefined)
      }
      if (decision.saveToAccount && current.authenticated) {
        void saveAccountLanguage(current.userId, decision.saveToAccount)
      }
      setNeedsChoice(decision.ask)
    }

    void getSession().then((current) => reconcile(current))
    const stop = subscribeToSession((next) => {
      // A genuine change of account is a fresh chance to ask.
      const who = next.authenticated ? `user:${next.userId}` : 'local'
      if (reconciled.current !== who) setPostponed(false)
      void reconcile(next)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  // The document itself has to know, or the browser cannot mirror the layout,
  // pick the right quotation marks, or hyphenate correctly.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = DIRECTION[lang]
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    setNeedsChoice(false)
    void getRepositories().settings.save({ language: next }).catch(() => undefined)
    const current = session.current
    if (current?.authenticated) void saveAccountLanguage(current.userId, next)
  }, [])

  const postponeChoice = useCallback(() => setPostponed(true), [])

  const value = useMemo(
    () => ({
      lang,
      dir: DIRECTION[lang],
      t: translator(lang),
      setLang,
      needsChoice: needsChoice && !postponed,
      postponeChoice,
    }),
    [lang, setLang, needsChoice, postponed, postponeChoice],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
