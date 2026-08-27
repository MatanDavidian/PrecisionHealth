import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'

/**
 * Something worth saying once, and never again.
 *
 * Dismissal is remembered per device in localStorage rather than in the
 * account: it is a fact about whether this person has read a sentence, not
 * health data, and losing it costs a single repeated notice.
 */
const seenKey = (id: string) => `notice-seen:${id}`

export const hasSeenNotice = (id: string): boolean => {
  try {
    return localStorage.getItem(seenKey(id)) !== null
  } catch {
    return false
  }
}

export const markNoticeSeen = (id: string): void => {
  try {
    localStorage.setItem(seenKey(id), new Date().toISOString())
  } catch {
    // Private browsing. The notice reappears; nothing breaks.
  }
}

export function OneTimeNotice({
  id,
  title,
  children,
  actionLabel,
  actionTo,
}: {
  id: string
  title: string
  children: React.ReactNode
  actionLabel?: string
  actionTo?: string
}) {
  const t = useT()
  const [dismissed, setDismissed] = useState(() => hasSeenNotice(id))
  if (dismissed) return null

  const dismiss = () => {
    markNoticeSeen(id)
    setDismissed(true)
  }

  return (
    <div className="mb-4 rounded-card border border-hairline bg-card-soft p-4">
      <p className="text-sm font-medium">{title}</p>
      <div className="pt-1 text-xs leading-relaxed text-ink-muted">{children}</div>
      <div className="flex flex-wrap gap-2 pt-3">
        {actionLabel && actionTo && (
          <Link
            to={actionTo}
            onClick={dismiss}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-surface"
          >
            {actionLabel}
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full border border-hairline px-3 py-1.5 text-xs"
        >
          {t('common.gotIt')}
        </button>
      </div>
    </div>
  )
}
