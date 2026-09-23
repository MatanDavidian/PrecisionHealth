import type { ReactNode } from 'react'
import { useT } from '../i18n'

/**
 * The line under a day's totals when those totals are an estimate.
 *
 * A filled day has no meals — nobody logged any — so the estimate lives with
 * the numbers it produced, not in the meal list. Showing it as a meal would
 * say something was eaten and logged; showing the totals bare would say the
 * same thing more quietly. This line is what keeps the tag on the number.
 *
 * It also says how the day stops being an estimate, because that is the one
 * useful thing to do with it: log what was really eaten, and it steps aside.
 */
export function EstimatedTotals({ action }: { action?: ReactNode }) {
  const t = useT()
  return (
    <div className="mt-3 flex items-start justify-between gap-3 border-t border-hairline pt-3">
      <p className="flex max-w-[52ch] items-start gap-2 text-xs leading-relaxed text-ink-muted">
        <span className="estimated-swatch mt-1 size-2.5 shrink-0 rounded-full" aria-hidden />
        <span>
          <span className="font-medium text-ink">{t('gaps.estimated')}.</span>{' '}
          {t('gaps.estimatedDayNote')}
        </span>
      </p>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  )
}
