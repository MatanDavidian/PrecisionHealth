import { useDataRevision } from '../DataProvider'
import { useT } from '../i18n'

/**
 * A write that failed, said out loud.
 *
 * Rendered once at the shell rather than per screen, so no write can fail
 * quietly regardless of where it was triggered from.
 */
export function WriteFailureBanner() {
  const t = useT()
  const { failure, dismissFailure } = useDataRevision()
  if (!failure) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-3 bottom-20 z-20 mx-auto max-w-md rounded-xl border border-accent-soft bg-surface p-3 shadow-lg md:bottom-4"
    >
      <p className="text-sm font-medium text-accent">
        {t('write.failed', { what: failure.what })}
      </p>
      <p className="pt-0.5 text-xs text-ink-muted">
        {t('write.failedBody', { message: failure.message })}
      </p>
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={failure.retry}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-surface"
        >
          {t('common.retry')}
        </button>
        <button
          type="button"
          onClick={dismissFailure}
          className="rounded-full border border-hairline px-3 py-1.5 text-xs"
        >
          {t('usuals.dismiss')}
        </button>
      </div>
    </div>
  )
}
