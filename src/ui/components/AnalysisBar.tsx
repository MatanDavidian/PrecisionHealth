import { useLocation, useNavigate } from 'react-router-dom'
import { convert } from '@/domain'
import { formatElapsed, useAnalysis, useElapsed } from '../AnalysisProvider'

/**
 * The analysis, following you around.
 *
 * A photo can take the better part of a minute to read. On a phone the preview
 * fills the screen, so a status line under it is simply not visible — which is
 * how "I took a picture and nothing happened" happens. This docks above the
 * tab bar, stays put when you wander off, and brings you back when you tap it.
 *
 * Hidden on the Log screen itself, where the photo IS the progress.
 */
export function AnalysisBar() {
  const { analysis } = useAnalysis()
  const navigate = useNavigate()
  const location = useLocation()
  const running = analysis?.status === 'running'
  const elapsed = useElapsed(analysis?.startedAt, running)

  if (!analysis || location.pathname === '/log') return null
  if (analysis.status === 'failed') return null

  const kcal =
    analysis.result &&
    Math.round(
      analysis.result.items.reduce((sum, item) => sum + item.energyKcal, 0),
    )

  return (
    <button
      type="button"
      onClick={() => navigate('/log')}
      className="fixed inset-x-3 bottom-20 z-10 mx-auto flex max-w-md items-center gap-3 rounded-full border border-hairline bg-surface px-4 py-2.5 text-left shadow-lg md:bottom-4"
    >
      <span
        className={`size-2 shrink-0 rounded-full ${running ? 'animate-pulse bg-accent' : 'bg-leaf'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {running ? `Analyzing your ${analysis.label}` : `${analysis.label} estimated`}
          {running && <span className="tabular font-normal text-ink-muted"> · {formatElapsed(elapsed)}</span>}
          {!running && kcal != null && (
            <span className="tabular font-normal text-ink-muted"> · {kcal} kcal</span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium text-accent">{running ? 'View' : 'Review'}</span>
    </button>
  )
}

/** Totals for a finished estimate, used by the Log screen's own header. */
export const estimateKcal = (items: { energyKcal: number }[]): number =>
  Math.round(items.reduce((sum, item) => sum + item.energyKcal, 0))

export { convert }
