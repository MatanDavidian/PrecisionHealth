import { LANGUAGES, translator, useLang } from '../i18n'

/**
 * Asked once per account, the first time someone signs in without a language.
 *
 * Deliberately not a Settings row nobody finds. The whole app and every answer
 * the model gives are about to be in one language or the other, and guessing
 * from `navigator.language` is a guess — a Hebrew reader on a laptop set up in
 * English gets English until they think to go looking.
 *
 * Both options are shown in their OWN language, never translated: "עברית" is
 * legible to the person who wants it whatever the app is currently speaking,
 * and "Hebrew" written in English helps only someone who does not need it.
 *
 * The card's own words are always English, whatever the browser guessed. This
 * is the one screen where the app does not yet know what language to use — so
 * it asks in the one most likely to be understood by someone who has not
 * answered, rather than committing to a guess it is in the middle of checking.
 * The two buttons carry the real meaning and need no translation at all.
 */
export function LanguagePrompt() {
  const { lang, setLang, needsChoice, postponeChoice } = useLang()
  const t = translator('en')
  if (!needsChoice) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="choose-language"
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-lg">
        <h2 id="choose-language" className="font-display text-2xl">
          {t('chooseLang.title')}
        </h2>
        <p className="pt-2 text-sm leading-relaxed text-ink-muted">{t('chooseLang.body')}</p>

        <div className="flex flex-col gap-2 pt-5">
          {LANGUAGES.map((option) => (
            <button
              key={option.value}
              type="button"
              lang={option.value}
              dir={option.value === 'he' ? 'rtl' : 'ltr'}
              onClick={() => setLang(option.value)}
              /* Ink, like every other selection. Accent here would read as the
                 app recommending a language, when all this marks is the one
                 guessed from the browser. */
              className={`rounded-full border px-4 py-3 text-base transition-colors ${
                lang === option.value
                  ? 'border-ink bg-ink font-medium text-canvas'
                  : 'border-hairline bg-surface hover:bg-card-soft'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/*
          An escape, because a modal with no way out is a trap when something
          goes wrong. It records nothing, so the question comes back at the
          next sign-in — which is the point: unanswered, not answered "no".
        */}
        <button
          type="button"
          onClick={postponeChoice}
          className="mt-4 w-full text-center text-xs text-ink-muted underline"
        >
          {t('chooseLang.later')}
        </button>
      </div>
    </div>
  )
}
