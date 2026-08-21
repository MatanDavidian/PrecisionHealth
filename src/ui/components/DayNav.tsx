import { dayLabel } from '../useSelectedDay'
import type { CalendarDate } from '@/domain'

/**
 * Moving between days. Forward is disabled on today rather than hidden, so the
 * control does not jump around as you navigate.
 */
export function DayNav({
  day,
  today,
  isToday,
  onPrevious,
  onNext,
  onToday,
}: {
  day: CalendarDate
  today: CalendarDate
  isToday: boolean
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Arrow label="Previous day" onClick={onPrevious} direction="left" />
      <button
        type="button"
        onClick={onToday}
        disabled={isToday}
        title={isToday ? undefined : 'Back to today'}
        className="min-w-[9.5rem] rounded-full px-3 py-1.5 text-sm text-ink-muted transition-colors enabled:hover:bg-card-soft disabled:cursor-default"
      >
        {dayLabel(day, today)}
      </button>
      <Arrow label="Next day" onClick={onNext} direction="right" disabled={isToday} />
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}
