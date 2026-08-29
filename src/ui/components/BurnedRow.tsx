import { useT } from '../i18n'

/**
 * Total daily expenditure, set by hand, inside the Activity card.
 *
 * It belongs beside the other activity figures rather than in a panel of its
 * own: it is one number among several, and giving it a card at the top of the
 * dashboard made the screen shout about the one thing the app cannot measure
 * for you.
 *
 * Two states, because "not set" is not "zero". Until a figure exists the week
 * has nothing to compare eating against, and saying so here — where the number
 * would go — is more use than an empty row reading a dash.
 */
export function BurnedRow({
  kcal,
  trackerKcal,
  onChange,
}: {
  /** The total the user has set, if they have. */
  kcal?: number
  /** What the device reported for activity — a hint, not the same quantity. */
  trackerKcal?: number
  onChange: (kcal: number) => void
}) {
  const t = useT()
  const hint = trackerKcal === undefined
    ? undefined
    : t('today.trackerRead', { count: Math.round(trackerKcal).toLocaleString() })

  if (kcal === undefined) {
    return (
      <div className="mt-2.5 border-t border-hairline pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-muted">{t('today.burnedTotal')}</span>
          <button
            type="button"
            // Seeded from the tracker when there is one: a number to adjust
            // beats a blank box, and it is the closest thing to an answer we
            // have.
            onClick={() => onChange(Math.round(trackerKcal ?? 2000))}
            className="rounded-full border border-hairline px-3.5 py-1 text-[0.81rem] font-medium transition-colors hover:bg-card-soft"
          >
            {t('today.setIt')}
          </button>
        </div>
        <p className="max-w-[34ch] pt-2 text-xs leading-relaxed text-ink-muted">
          {/* One sentence, whether or not there is a tracker to mention. */}
          {t('today.untilYouSet')}
          {hint ? ` — ${hint}.` : '.'}
        </p>
      </div>
    )
  }

  const nudge = (by: number) => onChange(Math.min(9000, Math.max(0, Math.round(kcal + by))))

  return (
    <div>
      <div className="flex items-center justify-between gap-3 py-1.5">
        <span className="text-sm text-ink-muted">{t('today.burnedTotal')}</span>
        <span className="flex items-center gap-2">
          <Nudge label={t('today.lessBurned')} onClick={() => nudge(-50)} path="M5 12h14" />
          <span className="tabular ltr-nums min-w-[4.1rem] text-center text-sm font-medium">
            {Math.round(kcal).toLocaleString()}
          </span>
          <Nudge label={t('today.moreBurned')} onClick={() => nudge(50)} path="M12 5v14M5 12h14" />
        </span>
      </div>
      <p className="pt-2 text-xs text-ink-muted">
        {t('today.yoursToSet')}
        {hint && ` · ${hint}`}
      </p>
    </div>
  )
}

function Nudge({ label, onClick, path }: { label: string; onClick: () => void; path: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-ink-muted transition-colors hover:bg-card-soft"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        aria-hidden
      >
        <path d={path} />
      </svg>
    </button>
  )
}
