import { formatElapsed, type Analysis } from '../../AnalysisProvider'
import { useT } from '../../i18n'

/** A ring, spinning, drawn about 43% open — same geometry as the design. */
function ProgressRing() {
  const r = 24
  const circumference = 2 * Math.PI * r
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      className="animate-spin"
      style={{ animationDuration: '1.1s' }}
      aria-hidden
    >
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="4" className="stroke-surface/30" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.57}
        transform="rotate(-90 28 28)"
        className="stroke-surface"
      />
    </svg>
  )
}

/**
 * What is being read, and how far it has got.
 *
 * The progress goes ON the thing being analysed rather than in a line
 * underneath it. On a phone the preview fills the screen, so a status line
 * below the fold is not visible at all — which is exactly how "I took a photo
 * and nothing happened" happens. A written meal gets the same treatment for
 * the same reason, even though its wait is only a second or two.
 */
export function InputPreview({
  analysis,
  elapsed,
  onEdit,
}: {
  analysis: Analysis
  elapsed: number
  /** Offered on a finished text estimate: change the words and ask again. */
  onEdit?: () => void
}) {
  const t = useT()
  const running = analysis.status === 'running'

  if (analysis.input.kind === 'text') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 rounded-full border border-hairline bg-surface px-4 py-2.5 text-sm">
          {analysis.input.description}
        </p>
        {onEdit && !running && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {t('log.action.edit')}
          </button>
        )}
        {running && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            {t('log.analyzing.working')}
            <span className="tabular ltr-nums text-xs">{formatElapsed(elapsed)}</span>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card">
      <img
        src={analysis.input.url}
        alt={t('log.photoAlt')}
        className="absolute inset-0 size-full object-cover"
      />
      {running && (
        <>
          {/* Solid, not dimmed: the wait lives here, not the photo underneath. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-ink">
            <ProgressRing />
            <p className="text-sm font-medium text-surface">{t('log.analyzing.reading')}</p>
            <p className="text-xs text-surface/70">
              <span className="tabular ltr-nums">{formatElapsed(elapsed)}</span> ·{' '}
              {t('log.analyzing.usually')}
            </p>
          </div>
          <div className="scan-sweep pointer-events-none absolute inset-x-0 top-0 h-1/4" />
        </>
      )}
    </div>
  )
}
