import { useDataRevision } from '../DataProvider'

/**
 * A write that failed, said out loud.
 *
 * Rendered once at the shell rather than per screen, so no write can fail
 * quietly regardless of where it was triggered from.
 */
export function WriteFailureBanner() {
  const { failure, dismissFailure } = useDataRevision()
  if (!failure) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-3 bottom-20 z-20 mx-auto max-w-md rounded-xl border border-accent-soft bg-surface p-3 shadow-lg md:bottom-4"
    >
      <p className="text-sm font-medium text-accent">Couldn’t save {failure.what}</p>
      <p className="pt-0.5 text-xs text-ink-muted">
        {failure.message}. Nothing was lost — try again.
      </p>
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={failure.retry}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-surface"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={dismissFailure}
          className="rounded-full border border-hairline px-3 py-1.5 text-xs"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
