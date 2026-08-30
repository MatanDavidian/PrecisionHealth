import { dayLabel } from '../useSelectedDay'
import { useT } from '../i18n'
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
  const t = useT()
  return (
    /* Full width on a phone, where the design gives it a row of its own with
       the label centred between the arrows; only as wide as it needs from
       `sm` up, where it shares the header with the title. */
    <div className="flex w-full items-center gap-1 sm:w-auto">
      <Arrow label={t('today.previousDay')} onClick={onPrevious} direction="left" />
      <button
        type="button"
        onClick={onToday}
        disabled={isToday}
        title={isToday ? undefined : t('today.backToToday')}
        className="flex-1 rounded-full px-3 py-1.5 text-sm text-ink-muted transition-colors enabled:hover:bg-card-soft disabled:cursor-default sm:min-w-[9.5rem] sm:flex-none"
      >
        {dayLabel(day, today, t)}
      </button>
      <Arrow label={t('today.nextDay')} onClick={onNext} direction="right" disabled={isToday} />
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
      {/*
        Mirrored in Hebrew: "back" points the way the reader came from, which
        is the other way round in an RTL layout. The arrow follows the text,
        not the compass.
      */}
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
