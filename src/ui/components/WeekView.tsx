import {
  OBJECTIVE_SHAPE,
  type CalendarDate,
  dayKey,
  peakOf,
  type Objective,
  type WeekEnergy,
} from '@/domain'
import { deviceZone } from '@/data/newRecords'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString()}`
const round = (n: number) => Math.round(n).toLocaleString()

/**
 * "22 – 28 Aug 2026", in whatever order the reader's language puts it.
 *
 * The year appears once, at the end, because a week never spans two of them in
 * a way worth saying twice — and repeating it is the kind of noise that makes a
 * header look like a receipt.
 */
export function weekRangeLabel(from: string, to: string, locale?: string): string {
  if (!from || !to) return ''
  const at = (d: string) => new Date(`${d}T12:00:00Z`)
  const short: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' }
  const start = at(from).toLocaleDateString(locale, short)
  const end = at(to).toLocaleDateString(locale, { ...short, year: 'numeric' })
  return `${start} – ${end}`
}

/**
 * "23 – 29 Aug", for a control with no room for the year.
 *
 * The full range is already in the header beneath the title, so repeating it
 * inside the stepper would spend the width twice on the same fact — and at
 * 11rem it did not fit, truncating to "Aug 23 – Aug 30, 20…" which was both
 * ugly and, as it turned out, wrong.
 */
export function compactRange(from: CalendarDate, to: CalendarDate, locale?: string): string {
  if (!from || !to) return ''
  const at = (d: string) => new Date(`${d}T12:00:00Z`)
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' }

  /*
    `formatRange` rather than two formatted dates joined by a dash. It knows
    that a range inside one month says the month once — "Aug 23 – 29" — and it
    knows where each language puts it. Hand-rolling that produced "23 – Aug 29"
    in English, which is the kind of wrong that only shows up on screen.
  */
  try {
    return new Intl.DateTimeFormat(locale, options).formatRange(at(from), at(to))
  } catch {
    return `${at(from).toLocaleDateString(locale, options)} – ${at(to).toLocaleDateString(locale, options)}`
  }
}

/** Just the day a week starts on, for a title that already has a range beneath it. */
export const weekStartLabel = (from: CalendarDate, locale?: string): string =>
  new Date(`${from}T12:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

/**
 * Seven days of eating against seven days of burning.
 *
 * The chart is two bars a day rather than one net bar on purpose: a net figure
 * hides whether a small deficit came from eating little or moving a lot, and
 * those are different weeks with different advice attached to them.
 *
 * Drawn with divs rather than a chart library. Fourteen rectangles and a
 * baseline do not justify forty kilobytes, and the one thing a library would
 * give — axes and ticks — is exactly what this design does without.
 */
/**
 * What the week is missing before it can say anything.
 *
 * Ordered: the burn figure first, because without it the chart has nothing to
 * draw and the totals are half a comparison. A goal only decides whether the
 * week can be *judged*, which is a smaller absence.
 */
export type WeekBlocker = 'BURN' | 'GOAL' | undefined

export const weekBlocker = (week: WeekEnergy, objective?: Objective): WeekBlocker =>
  week.daysWithBurn === 0 ? 'BURN' : objective === undefined ? 'GOAL' : undefined

/**
 * Said instead of the week, when the week would be guessing.
 *
 * Showing a chart with one series and a summary that compares a number against
 * nothing would look like an answer. An empty state that says which figure is
 * missing, and offers to go and set it, is the honest version.
 */
export function WeekBlocked({ blocker, onGo }: { blocker: 'BURN' | 'GOAL'; onGo: () => void }) {
  const t = useT()
  return (
    <div className="max-w-md">
      <section className="rounded-card bg-card p-6">
        <h2 className="font-display text-[1.4rem] font-medium">
          {t(blocker === 'BURN' ? 'week.blockedBurnTitle' : 'week.blockedGoalTitle')}
        </h2>
        <p className="max-w-[44ch] pt-2 text-sm leading-relaxed text-ink-muted">
          {t(blocker === 'BURN' ? 'week.blockedBurnBody' : 'week.blockedGoalBody')}
        </p>
        <button
          type="button"
          onClick={onGo}
          className="mt-4 rounded-full border border-hairline px-4 py-1.5 text-[0.84rem] font-medium transition-colors hover:bg-card-soft"
        >
          {t('week.setItOnTheDay')}
        </button>
      </section>
    </div>
  )
}

export function WeekView({
  week,
  objective,
  insights,
}: {
  week: WeekEnergy
  objective?: Objective
  /** The AI card, owned by the screen because it holds the request state. */
  insights?: React.ReactNode
}) {
  const t = useT()
  const zone = deviceZone()
  const today = dayKey(new Date().toISOString(), zone)
  const peak = peakOf(week.days)
  const net = Math.round(week.balance.netKcal)

  const label = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(document.documentElement.lang || undefined, {
      weekday: 'narrow',
    })

  return (
    <div className="grid gap-4">
      <section className="rounded-card bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {t('week.chartTitle')}
          </p>
          <div className="flex gap-4 text-[0.78rem] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-accent" />
              {t('week.eaten')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-leaf" />
              {t('week.burned')}
            </span>
          </div>
        </div>

        <div className="flex items-stretch gap-2.5 pt-5" style={{ height: 196 }}>
          {week.days.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col gap-2.5">
              <div className="flex flex-1 items-end gap-1.5">
                {/* An unlogged day is a hairline, not a missing bar: the gap is
                    information, and an absent column reads as a chart error. */}
                <div
                  className={`flex-1 rounded-t-md ${d.eatenKcal > 0 ? 'bg-accent' : 'bg-hairline'}`}
                  style={{ height: d.eatenKcal > 0 ? `${(d.eatenKcal / peak) * 100}%` : 2 }}
                  title={`${t('week.eaten')} ${round(d.eatenKcal)}`}
                />
                <div
                  className={`flex-1 rounded-t-md ${d.burnedKcal ? 'bg-leaf' : 'bg-hairline'}`}
                  style={{ height: d.burnedKcal ? `${(d.burnedKcal / peak) * 100}%` : 2 }}
                  title={`${t('week.burned')} ${d.burnedKcal ? round(d.burnedKcal) : '—'}`}
                />
              </div>
              <span
                className={`text-center text-xs ${
                  d.day === today ? 'font-medium text-ink' : 'text-ink-muted'
                }`}
              >
                {label(d.day)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-card bg-card p-6">
          <p className="pb-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {t('week.title')}
          </p>
          {/* Number pinned, unit not: "kcal" is a word in Hebrew and has to
              flow with the page, exactly as on the estimate summary. */}
          <p
            className={`font-display text-[2.4rem] leading-none font-medium ${
              net > 0 ? 'text-accent' : 'text-leaf'
            }`}
          >
            <span className="tabular ltr-nums">{signed(net)}</span> {t('week.kcalUnit')}
          </p>
          <p className="max-w-[34ch] pt-1.5 text-[0.94rem] text-ink-muted">
            {net === 0
              ? t('week.levelSentence')
              : net < 0
                ? t('week.underSentence', { count: round(-net) })
                : t('week.overSentence', { count: round(net) })}
          </p>

          <div className="mt-4 border-t border-hairline pt-3">
            <Row
              name={t('week.eaten')}
              /*
                Averaged over the days being COMPARED, not over seven.

                `balance.eatenKcal` counts only days that also carry a burn
                figure, so dividing it by seven mixed one basis with another and
                produced a daily figure roughly half the truth — 1,088 where the
                real average was 2,538. Both rows now use the same denominator
                as the net above them, which is the only way the three numbers
                can be read together.
              */
              value={t('week.perDay', {
                total: round(week.balance.eatenKcal),
                average: round(week.balance.eatenKcal / Math.max(1, week.daysWithBurn)),
              })}
            />
            <Row
              name={t('week.burned')}
              value={
                week.daysWithBurn === 0
                  ? '—'
                  : t('week.perDay', {
                      total: round(week.balance.burnedKcal),
                      average: round(week.balance.burnedKcal / week.daysWithBurn),
                    })
              }
            />
          </div>

          {/* Said out loud, because averaging four days as if they were seven
              would quietly understate the burn. */}
          {/*
            Says what the three numbers above are actually over, and how much
            eating is not in them. A card that silently reports part of a week
            as if it were the whole is worse than one that shows less.
          */}
          {week.daysWithBurn > 0 && week.daysWithBurn < week.days.length && (
            <p className="max-w-[38ch] pt-2 text-xs leading-relaxed text-ink-muted">
              {t('week.partialBurn', { count: week.daysWithBurn })}
              {week.eatenAllDays > week.balance.eatenKcal && (
                <>
                  {' '}
                  {t('week.eatenElsewhere', {
                    count: round(week.eatenAllDays - week.balance.eatenKcal),
                  })}
                </>
              )}
            </p>
          )}
          {week.daysWithBurn === 0 && (
            <p className="pt-2 text-xs text-ink-muted">{t('week.noBurnData')}</p>
          )}
        </section>

        <section className="rounded-card bg-card p-6">
          <p className="pb-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {t('week.againstGoal')}
          </p>
          <p className="text-[1.05rem] font-medium">
            {objective ? t(`objective.${objective}` as StringKey) : t('objective.none')}
          </p>
          <p className="max-w-[38ch] pt-1.5 text-sm text-ink-muted">
            {!objective
              ? t('week.noGoalYet')
              : week.aimKcal === null
                ? t('week.noTarget')
                : t('week.aimsFor', {
                    aim:
                      week.aimKcal === 0
                        ? t('week.levelWeek')
                        : t('week.aimOver', { count: signed(week.aimKcal) }),
                    net: signed(net),
                  })}
          </p>

          <div
            className={`mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-[0.81rem] font-medium ${
              week.verdict === 'UNGRADED'
                ? 'bg-card-soft text-ink-muted'
                : week.verdict === 'ON_TRACK'
                  ? 'bg-leaf-soft text-leaf'
                  : 'bg-accent-soft text-accent'
            }`}
          >
            {week.verdict === 'UNGRADED'
              ? t('week.ungraded')
              : week.verdict === 'ON_TRACK'
                ? t('week.onTrack')
                : objective && (OBJECTIVE_SHAPE[objective].dailyKcal ?? 0) < 0
                  ? t('week.short', { count: round(Math.abs(week.gapKcal)) })
                  : t('week.off', { count: round(Math.abs(week.gapKcal)) })}
          </div>

          {/*
            Said only when there is no target and the gap is large.

            Refusing to GRADE an untargeted goal is right — scoring someone
            against a target they never set is inventing one for them. But "you
            are not being scored" is not "nothing here is worth knowing", and
            eating four thousand more than you burned in a week is worth knowing
            whatever you told the app you were doing. So it is an observation,
            never a pass or a fail.
          */}
          {week.drift && (
            <div className="pt-3">
              <p className="max-w-[38ch] text-[0.86rem] leading-relaxed text-ink-soft">
                {t(week.drift.direction === 'OVER' ? 'week.driftOver' : 'week.driftUnder', {
                  count: week.drift.kcal.toLocaleString(),
                })}
              </p>
              <p className="pt-1 text-xs text-ink-muted">{t('week.driftNote')}</p>
            </div>
          )}
        </section>
      </div>

      {insights}
    </div>
  )
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm text-ink-muted">{name}</span>
      <span className="tabular ltr-nums text-sm font-medium">{value}</span>
    </div>
  )
}

/** The card on the day view that leads here. */
export function WeekTeaser({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  return (
    <section className="rounded-card bg-leaf-soft p-5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf">AI</p>
      <h2 className="pt-2 font-display text-xl font-medium">{t('today.aiTitle')}</h2>
      <p className="pt-1 text-sm text-ink-muted">{t('week.sevenDays')}</p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3.5 rounded-full border border-leaf/30 px-4 py-1.5 text-[0.84rem] font-medium text-leaf transition-colors hover:bg-leaf/10"
      >
        {t('week.openTheWeek')}
      </button>
    </section>
  )
}
