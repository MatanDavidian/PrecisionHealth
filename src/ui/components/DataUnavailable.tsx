import { Card } from './Card'
import { useT } from '../i18n'

/**
 * A read that failed, said plainly.
 *
 * The app is online-first by decision (D16), so it does not half-work: when it
 * cannot reach your data it says so and offers to try again, rather than
 * showing an empty day that looks like you logged nothing.
 */
export function DataUnavailable({
  error,
  onRetry,
  signedIn,
}: {
  error: string
  onRetry: () => void
  signedIn: boolean
}) {
  const t = useT()
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h2 className="font-display text-xl">{t('unavailable.title')}</h2>
        <p className="pt-1 text-sm text-ink-muted">
          {signedIn ? t('unavailable.signedIn') : t('unavailable.local')}
        </p>
        <p className="pt-2 text-xs text-ink-muted">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface"
        >
          {t('common.retry')}
        </button>
      </Card>
    </div>
  )
}
