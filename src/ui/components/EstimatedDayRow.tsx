import type { ReactNode } from 'react'
import { useT } from '../i18n'

/**
 * A day nobody logged, standing in as the person's average.
 *
 * One line and a number, never a list of foods. The record is a claim about
 * how much, not about what; showing it as meals would put a lunch on the day
 * that may never have been eaten, and the next person to read the day — the
 * user, a month later — would believe it.
 *
 * The note says how it stops being an estimate, because that is the only
 * useful thing to do with it: log what was really eaten, and it steps aside.
 */
export function EstimatedDayRow({ kcal, action }: { kcal: number; action?: ReactNode }) {
  const t = useT()
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="estimated-swatch size-2.5 rounded-full" aria-hidden />
          {t('gaps.estimatedDay')}
        </span>
        <span className="flex items-center gap-2.5">
          <span className="tabular ltr-nums text-sm font-medium">
            ~{Math.round(kcal)} kcal
          </span>
          {action}
        </span>
      </div>
      <p className="max-w-[52ch] pt-1 text-xs leading-relaxed text-ink-muted">
        {t('gaps.estimatedDayNote')}
      </p>
    </div>
  )
}
