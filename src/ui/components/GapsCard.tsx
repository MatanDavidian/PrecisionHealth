import type { CalendarDate, DayGap } from '@/domain'
import { useT } from '../i18n'

/**
 * The offer to fill days that were never logged.
 *
 * The sentence matters more than the button. "2 days have no meals on them"
 * followed by "which is not the same as eating nothing" is the whole argument
 * for the feature existing: a blank day reads as a zero, a zero drags every
 * average and every graded week down, and the person knows perfectly well they
 * ate — they just did not type it.
 *
 * Dashed rather than solid, and never the accent fill of a primary action.
 * This is an offer about days that do not exist yet, and it should not compete
 * with the week's real numbers sitting underneath it.
 */
export function GapsCard({
  gaps,
  busy,
  canFill,
  basis,
  onFill,
  formatDay,
}: {
  /** Open gaps only — days already filled are not offered again. */
  gaps: DayGap[]
  busy: boolean
  /**
   * False when there is too little history to call anything typical.
   *
   * The card still appears, because the gap is real and worth naming. Only the
   * button goes: offering to fill from three days of data would dress a guess
   * as a habit.
   */
  canFill: boolean
  /**
   * Which logged days the average comes from.
   *
   * Said on the card because it is no longer always "the last two weeks": if
   * those were filled rather than logged, the average reaches further back,
   * and a number drawn from August is a different claim from one drawn from
   * last week.
   */
  basis?: { count: number; from: CalendarDate; to: CalendarDate }
  onFill: () => void
  formatDay: (day: CalendarDate) => string
}) {
  const t = useT()
  if (gaps.length === 0) return null

  const named = gaps.slice(0, 3).map((gap) => formatDay(gap.day))
  const days =
    gaps.length <= 3
      ? new Intl.ListFormat(document.documentElement.lang || undefined, {
          style: 'long',
          type: 'conjunction',
        }).format(named)
      : t('gaps.andMore', { days: named.join(', '), count: gaps.length - 3 })

  return (
    <section className="rounded-card border border-dashed border-hairline p-6">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {t('gaps.label')}
      </p>
      <h2 className="pt-2 font-display text-xl leading-snug">
        {t('gaps.title', { count: gaps.length })}
      </h2>
      <p className="max-w-[52ch] pt-1.5 text-sm leading-relaxed text-ink-muted">
        {t('gaps.body', { days })}
      </p>

      {canFill && basis && (
        <p className="pt-1.5 text-xs text-ink-muted">
          {t('gaps.basis', { count: basis.count, range: dateRange(basis.from, basis.to) })}
        </p>
      )}

      {canFill ? (
        <button
          type="button"
          onClick={onFill}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2.5 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-surface disabled:opacity-40"
        >
          <PatternIcon />
          {busy
            ? t('gaps.filling')
            : gaps.length === 1
              ? t('gaps.fillOne')
              : t('gaps.fillAll', { count: gaps.length })}
        </button>
      ) : (
        /* Named rather than silently absent: a missing button with no
           explanation reads as a bug, not as a judgement about evidence. */
        <p className="pt-3 text-xs text-ink-muted">{t('gaps.notEnoughHistory')}</p>
      )}
    </section>
  )
}

/** "20 Aug – 8 Sep", in the page's language. One date when both ends agree. */
function dateRange(from: CalendarDate, to: CalendarDate): string {
  const format = new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const show = (day: CalendarDate) => format.format(new Date(`${day}T12:00:00Z`))
  return from === to ? show(from) : `${show(from)} – ${show(to)}`
}

/** A scatter of marks — a pattern rather than a measurement. */
function PatternIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="4" r="1.9" />
      <circle cx="12" cy="20" r="1.9" />
      <circle cx="4" cy="12" r="1.9" />
      <circle cx="20" cy="12" r="1.9" />
      <circle cx="6.3" cy="6.3" r="1.5" />
      <circle cx="17.7" cy="17.7" r="1.5" />
      <circle cx="17.7" cy="6.3" r="1.5" />
      <circle cx="6.3" cy="17.7" r="1.5" />
    </svg>
  )
}
