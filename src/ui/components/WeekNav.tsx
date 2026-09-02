import { addWeeks, weekContaining, weekStartOf, type CalendarDate } from '@/domain'
import { useT } from '../i18n'
import { compactRange } from './WeekView'

/**
 * Moving between weeks, in the shape the day stepper already has.
 *
 * Forward is disabled once you are in the current week rather than hidden, so
 * the control does not move as you navigate — the same rule the day arrows
 * follow, and the same reason.
 */
export function WeekNav({
  day,
  today,
  onGo,
}: {
  /** Any day in the week being shown. */
  day: CalendarDate
  today: CalendarDate
  onGo: (day: CalendarDate) => void
}) {
  const t = useT()
  const week = weekContaining(day)
  const start = week[0]
  // The week's own last day. Next Sunday belongs to the week after, and saying
  // so put an eighth day in the label.
  const end = week[6]
  const isThisWeek = start === weekStartOf(today)
  const locale = document.documentElement.lang || undefined

  return (
    <div className="flex w-full items-center gap-1 sm:w-auto">
      <Arrow label={t('week.previousWeek')} direction="left" onClick={() => onGo(addWeeks(day, -1))} />
      <button
        type="button"
        onClick={() => onGo(today)}
        disabled={isThisWeek}
        title={isThisWeek ? undefined : t('week.backToThisWeek')}
        className="flex-1 rounded-full px-3 py-1.5 text-sm text-ink-muted transition-colors enabled:hover:bg-card-soft disabled:cursor-default truncate sm:w-[11rem] sm:flex-none"
      >
        {isThisWeek ? t('week.thisWeek') : compactRange(start, end, locale)}
      </button>
      <Arrow
        label={t('week.nextWeek')}
        direction="right"
        disabled={isThisWeek}
        onClick={() => onGo(addWeeks(day, 1))}
      />
    </div>
  )
}

function Arrow({
  label,
  onClick,
  direction,
  disabled,
}: {
  label: string
  onClick: () => void
  direction: 'left' | 'right'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-full p-2 text-ink-muted transition-colors enabled:hover:bg-card-soft disabled:opacity-25"
    >
      {/* Mirrored in Hebrew: "back" points the way the reader came from. */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="rtl:-scale-x-100"
        aria-hidden
      >
        <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}
