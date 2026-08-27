import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendSignInCode, verifySignInCode } from '@/data/session'
import { Card } from '../components/Card'
import { useT } from '../i18n'

const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'

type Stage =
  | { kind: 'email' }
  | { kind: 'sending' }
  | { kind: 'code' }
  | { kind: 'verifying' }

/**
 * Sign in by email — no passwords, which is the right shape for a family app
 * where nobody wants to manage one.
 *
 * The LINK is the primary path, because it works with Supabase's stock email
 * template. A six-digit code only appears in that email if the template
 * includes `{{ .Token }}`, so the code box is offered second and framed as
 * optional — a UI that demands a code the email does not contain is a dead
 * end.
 */
export function SignIn() {
  const t = useT()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'email' })
  const [error, setError] = useState<string>()

  async function requestCode(event: FormEvent) {
    event.preventDefault()
    if (!email.trim()) return
    setStage({ kind: 'sending' })
    setError(undefined)
    try {
      await sendSignInCode(email)
      setStage({ kind: 'code' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('signin.errSend'))
      setStage({ kind: 'email' })
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault()
    if (!code.trim()) return
    setStage({ kind: 'verifying' })
    setError(undefined)
    try {
      await verifySignInCode(email, code)
      // The session subscription swaps the store; this just gets out of the way.
      navigate('/today')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('signin.errCode'))
      setStage({ kind: 'code' })
    }
  }

  const busy = stage.kind === 'sending' || stage.kind === 'verifying'

  return (
    <div className="mx-auto max-w-md">
      <header className="pb-6">
        <h1 className="font-display text-4xl">{t('signin.title')}</h1>
        <p className="pt-1 text-sm text-ink-muted">{t('signin.subtitle')}</p>
      </header>

      <Card>
        {stage.kind === 'email' || stage.kind === 'sending' ? (
          <form onSubmit={requestCode}>
            <label className={label} htmlFor="email">
              {t('signin.email')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={field}
              placeholder={t('signin.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="pt-1 text-xs text-ink-muted">{t('signin.firstTime')}</p>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
            >
              {stage.kind === 'sending' ? t('signin.sending') : t('signin.emailMeCode')}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <p className="text-sm">{t('signin.check', { email })}</p>
            <p className="pb-4 pt-1 text-xs text-ink-muted">{t('signin.closePage')}</p>

            <label className={label} htmlFor="code">
              {t('signin.orCode')}
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className={`${field} tabular tracking-[0.3em]`}
              placeholder={t('signin.codePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex flex-wrap gap-3 pt-4">
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
              >
                {stage.kind === 'verifying' ? t('signin.checking') : t('signin.withCode')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage({ kind: 'email' })
                  setCode('')
                  setError(undefined)
                }}
                className="rounded-full border border-hairline px-4 py-2 text-sm"
              >
                {t('signin.anotherEmail')}
              </button>
            </div>
          </form>
        )}

        {error && <p className="pt-3 text-xs text-accent">{error}</p>}
      </Card>

      <p className="px-1 pt-4 text-xs text-ink-muted">{t('signin.signedOutNote')}</p>
    </div>
  )
}
