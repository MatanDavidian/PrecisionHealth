import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendSignInCode, verifySignInCode } from '@/data/session'
import { Card } from '../components/Card'

const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'

type Stage =
  | { kind: 'email' }
  | { kind: 'sending' }
  | { kind: 'code' }
  | { kind: 'verifying' }

/**
 * Sign in with an emailed code — no passwords, which is the right shape for a
 * family app where nobody wants to manage one.
 *
 * The same email also carries a link; clicking it signs you in on that device
 * without ever returning here. The code exists for the common case of reading
 * mail on the phone while the app is open on a laptop.
 */
export function SignIn() {
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
      setError(cause instanceof Error ? cause.message : 'Could not send the code')
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
      setError(cause instanceof Error ? cause.message : 'That code was not accepted')
      setStage({ kind: 'code' })
    }
  }

  const busy = stage.kind === 'sending' || stage.kind === 'verifying'

  return (
    <div className="mx-auto max-w-md">
      <header className="pb-6">
        <h1 className="font-display text-4xl">Sign in</h1>
        <p className="pt-1 text-sm text-ink-muted">
          So your data follows you between devices instead of living in one browser.
        </p>
      </header>

      <Card>
        {stage.kind === 'email' || stage.kind === 'sending' ? (
          <form onSubmit={requestCode}>
            <label className={label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={field}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="pt-1 text-xs text-ink-muted">
              First time signing in creates your account. No password to remember.
            </p>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
            >
              {stage.kind === 'sending' ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <p className="pb-3 text-sm text-ink-muted">
              Sent to <span className="font-medium text-ink">{email}</span>. Enter the code, or
              just click the link in the email on this device.
            </p>
            <label className={label} htmlFor="code">
              Code
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className={`${field} tabular tracking-[0.3em]`}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex flex-wrap gap-3 pt-4">
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
              >
                {stage.kind === 'verifying' ? 'Checking…' : 'Sign in'}
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
                Use another email
              </button>
            </div>
          </form>
        )}

        {error && <p className="pt-3 text-xs text-accent">{error}</p>}
      </Card>

      <p className="px-1 pt-4 text-xs text-ink-muted">
        Signed out, the app still works — everything stays in this browser, and nothing is sent
        anywhere. Your API key never syncs either way.
      </p>
    </div>
  )
}
