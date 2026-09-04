import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { grant, outstanding, readConsents } from '@/data/consent'
import { newId } from '@/data/newRecords'
import type { PolicyDocument } from '@/policy/documents'
import { POLICY_AT } from '../screens/Policy'
import { useDataRevision } from '../DataProvider'
import { useLang, useT } from '../i18n'
import { LanguagePrompt } from './LanguagePrompt'

/**
 * Asks for consent, once per version, and records the answer.
 *
 * S5.2. Deliberately separate from the terms rather than bundled into a single
 * "I agree" — GDPR requires consent to health-data processing to be
 * *separable* from accepting a contract, and two checkboxes is what separable
 * looks like on a screen.
 *
 * Unticked by default, and the button stays dead until both are ticked. A
 * pre-ticked box is not consent under Art. 4(11); it is a layout.
 *
 * Shown only to people with an ACCOUNT. Signed out, nothing leaves the browser
 * and there is no third party and no controller to consent to — asking anyway
 * would be theatre, and would teach people to click past the real one.
 */
export function Interruptions() {
  const consent = useOutstandingConsents()

  /*
    One at a time, and consent first.

    Both were rendered unconditionally, which stacked two `aria-modal` dialogs
    on top of each other: sighted users saw only the upper one, and anyone on a
    screen reader got two competing modal contexts. Consent wins because it
    gates processing that has already been asked for — a question about wording
    can wait; permission to hold the data cannot.
  */
  if (consent.needed === undefined) return null
  if (consent.needed.length > 0) return <ConsentGate {...consent} />
  return <LanguagePrompt />
}

/** What this account still has to agree to, and how to record that it did. */
function useOutstandingConsents() {
  const { session } = useDataRevision()
  const { lang, t } = useLang()
  const { pathname } = useLocation()
  const [needed, setNeeded] = useState<PolicyDocument[]>()
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string>()

  const check = useCallback(async () => {
    if (!session.authenticated) {
      setNeeded([])
      return
    }
    const consents = await readConsents(session.userId)
    /*
      Undefined means "we could not tell" — no project configured, or the
      migration unapplied. Not "they consented to nothing".

      Putting a consent wall in front of an app that has no way to record the
      answer would trap every user behind a button that cannot work.
    */
    setNeeded(consents === undefined ? [] : outstanding(consents))
  }, [session])

  useEffect(() => {
    void check()
  }, [check])

  const agree = useCallback(async () => {
    if (!needed) return
    setSaving(true)
    setProblem(undefined)
    try {
      await grant(session.userId, needed, lang, newId)
      await check()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t('consent.failed'))
    } finally {
      setSaving(false)
    }
  }, [check, lang, needed, session.userId, t])

  /*
    Never on top of the documents themselves.

    Otherwise the modal covers the very text it is asking you to agree to, and
    the "read this" links lead to a page you cannot see — a consent screen that
    makes informed consent impossible.
  */
  return { needed: POLICY_AT[pathname] ? [] : needed, agree, saving, problem }
}

function ConsentGate({
  needed,
  agree,
  saving,
  problem,
}: {
  needed?: PolicyDocument[]
  agree: () => Promise<void>
  saving: boolean
  problem?: string
}) {
  const t = useT()
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  if (!needed) return null
  const all = needed.every((document) => ticked[document.id])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-4 sm:items-center"
    >
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-card bg-surface p-6 shadow-lg">
        <h2 id="consent-title" className="font-display text-2xl">
          {t('consent.title')}
        </h2>
        <p className="pt-2 text-sm leading-relaxed text-ink-muted">{t('consent.body')}</p>

        <div className="flex flex-col gap-3 pt-5">
          {needed.map((document) => (
            <label key={document.id} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={ticked[document.id] ?? false}
                onChange={(e) => setTicked((was) => ({ ...was, [document.id]: e.target.checked }))}
              />
              <span>
                {document.id === 'PRIVACY' ? t('consent.privacy') : t('consent.terms')}{' '}
                <Link
                  className="underline"
                  to={document.id === 'PRIVACY' ? '/privacy' : '/terms'}
                  target="_blank"
                >
                  {t('consent.read', { title: document.title })}
                </Link>
              </span>
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void agree()}
          disabled={!all || saving}
          className="mt-5 w-full rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-surface disabled:opacity-40"
        >
          {saving ? t('consent.saving') : t('consent.agree')}
        </button>

        {/*
          No "later". The language question has one because postponing it costs
          nothing; this one gates processing that has already been asked for,
          and a dismissable consent prompt is not a consent prompt. Signing out
          is the way past it, and it is offered rather than left to be guessed.
        */}
        <p className="pt-3 text-center text-xs text-ink-muted">
          {t('consent.orElse')}{' '}
          <Link className="underline" to="/settings">
            {t('consent.signOut')}
          </Link>
          .
        </p>

        {problem && <p className="pt-3 text-xs text-accent">{problem}</p>}
      </div>
    </div>
  )
}
