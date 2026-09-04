import { useState } from 'react'
import { eraseLocalStore, getRepositories } from '@/data'
import { collectPersonalExport, exportFilename } from '@/data/personalExport'
import { deleteAccount, DELETE_CONFIRMATION } from '@/data/deleteAccount'
import type { Session } from '@/data/session'
import { Card } from './Card'
import { useT } from '../i18n'

/**
 * Take your data with you, or leave.
 *
 * S5.3 and S5.4, and the reason they are one component: they are the two
 * halves of the same right, and putting the export anywhere other than
 * immediately above the delete would be arranging the screen so that the
 * easier action is the harder one to find.
 *
 * Which delete you get depends on where your data actually is. Signed in, it
 * is the account; signed out, it is this browser. They are not the same
 * operation and the screen does not pretend otherwise — a single "delete
 * everything" button would be lying to one of the two audiences.
 */
export function AccountData({
  session,
  authAvailable,
  onChanged,
}: {
  session: Session
  authAvailable: boolean
  /** Reads have to re-run: everything on every other screen just went. */
  onChanged: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState<'export' | 'delete'>()
  const [problem, setProblem] = useState<string>()
  const [done, setDone] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  const exportEverything = async () => {
    setBusy('export')
    setProblem(undefined)
    try {
      const at = new Date().toISOString()
      const file = await collectPersonalExport(
        getRepositories(),
        { userId: session.userId, email: session.email, authenticated: session.authenticated },
        at,
      )
      /*
        Built in the browser and handed straight to it. The file is the
        person's own data and there is no reason for it to touch a server on
        the way out — which also means the export works with no network at all.
      */
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = exportFilename(at)
      link.click()
      // Revoked on the next tick: revoking synchronously can beat the download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setDone(t('settings.exportDone', { count: Object.values(file.counts).reduce((a, b) => a + b, 0) }))
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t('settings.exportFailed'))
    } finally {
      setBusy(undefined)
    }
  }

  const remove = async () => {
    setBusy('delete')
    setProblem(undefined)
    try {
      if (session.authenticated) {
        const result = await deleteAccount(typed.trim())
        if (!result.ok) {
          setProblem(result.reason)
          return
        }
        setDone(t('settings.deleteAccountDone'))
      } else {
        await eraseLocalStore(session.userId)
        setDone(t('settings.eraseLocalDone'))
      }
      setConfirming(false)
      setTyped('')
      onChanged()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t('settings.deleteFailed'))
    } finally {
      setBusy(undefined)
    }
  }

  const deletesAccount = session.authenticated && authAvailable

  return (
    <>
      <Card label={t('settings.export')}>
        <p className="text-sm text-ink-muted">{t('settings.exportNote')}</p>
        <button
          type="button"
          onClick={() => void exportEverything()}
          disabled={busy !== undefined}
          className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft disabled:opacity-40"
        >
          {busy === 'export' ? t('settings.exportPreparing') : t('settings.exportButton')}
        </button>
        {/* Said here rather than only in the file: someone deciding whether to
            export deserves to know the key is not in it before they look. */}
        <p className="pt-3 text-xs text-ink-muted">{t('settings.exportExcludes')}</p>
      </Card>

      <Card label={deletesAccount ? t('settings.deleteAccount') : t('settings.eraseLocal')}>
        <p className="text-sm text-ink-muted">
          {deletesAccount ? t('settings.deleteAccountBody') : t('settings.eraseLocalBody')}
        </p>

        {!confirming ? (
          <button
            type="button"
            onClick={() => {
              setConfirming(true)
              setDone(undefined)
              setProblem(undefined)
            }}
            /* Outlined in accent rather than filled: it should be findable and
               never the thing your thumb lands on by accident. */
            className="mt-3 rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            {deletesAccount ? t('settings.deleteAccountButton') : t('settings.eraseLocalButton')}
          </button>
        ) : (
          <div className="mt-3 rounded-xl border border-accent bg-accent-soft/40 p-3">
            <p className="text-sm font-medium">{t('settings.deleteSure')}</p>
            <p className="pt-1 text-xs leading-relaxed">
              {deletesAccount ? t('settings.deleteAccountWarn') : t('settings.eraseLocalWarn')}
            </p>

            {/*
              Typing the word, and only for the account.

              Clearing a browser is undone by signing back in; deleting an
              account is not undone by anything. The friction belongs to the
              one that is actually irreversible — putting it on both would
              train people to type past it.
            */}
            {deletesAccount && (
              <label className="mt-3 block">
                <span className="block pb-1 text-xs font-medium">
                  {t('settings.deleteType', { word: DELETE_CONFIRMATION })}
                </span>
                <input
                  aria-label={t('settings.deleteType', { word: DELETE_CONFIRMATION })}
                  className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}

            <div className="flex flex-wrap gap-3 pt-3">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={
                  busy !== undefined || (deletesAccount && typed.trim() !== DELETE_CONFIRMATION)
                }
                className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
              >
                {busy === 'delete' ? t('settings.deleting') : t('settings.deleteConfirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                  setTyped('')
                }}
                className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
              >
                {t('settings.deleteCancel')}
              </button>
            </div>
          </div>
        )}

        {done && <p className="pt-3 text-sm text-leaf">{done}</p>}
        {problem && <p className="pt-3 text-sm text-accent">{problem}</p>}
      </Card>
    </>
  )
}
