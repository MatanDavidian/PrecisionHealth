import { formatElapsed, type Analysis } from '../../AnalysisProvider'

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
            Edit
          </button>
        )}
        {running && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            Working it out…
            <span className="tabular text-xs">{formatElapsed(elapsed)}</span>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-card">
      <img
        src={analysis.input.url}
        alt="The meal you photographed"
        className={`w-full object-cover transition-opacity ${running ? 'opacity-60' : ''}`}
      />
      {running && (
        <div className="absolute inset-x-0 bottom-0 bg-ink/75 px-4 py-3 text-surface">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 animate-pulse rounded-full bg-surface" />
            Reading your plate…
            <span className="tabular font-normal opacity-80">
              {formatElapsed(elapsed)} · usually about 15 seconds
            </span>
          </p>
          <p className="pt-0.5 text-xs opacity-75">
            You can leave — it keeps going, and the bar below stays until it's done.
          </p>
        </div>
      )}
    </div>
  )
}
