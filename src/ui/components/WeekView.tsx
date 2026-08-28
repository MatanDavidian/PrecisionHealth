import {
  OBJECTIVE_SHAPE,
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
export function WeekView({ week, objective }: { week: WeekEnergy; objective?: Objective }) {
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
              value={t('week.perDay', {
                total: round(week.balance.eatenKcal),
                average: round(week.balance.eatenKcal / week.days.length),
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
          {week.daysWithBurn > 0 && week.daysWithBurn < week.days.length && (
            <p className="pt-2 text-xs text-ink-muted">
              {t('week.partialBurn', { count: week.daysWithBurn })}
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
        </section>
      </div>

      <section className="rounded-card bg-leaf-soft p-6">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf">AI</p>
        <h2 className="pt-2 font-display text-xl font-medium">{t('week.insightsTitle')}</h2>
        <p className="max-w-[56ch] pt-1 text-sm text-ink-muted">{t('week.insightsBody')}</p>
        <div className="flex flex-wrap items-center gap-3 pt-3.5">
          <button
            type="button"
            disabled
            className="cursor-default rounded-full border border-leaf/30 px-4 py-1.5 text-[0.84rem] font-medium text-leaf opacity-55"
          >
            {t('week.askForInsights')}
          </button>
          <span className="rounded-full border border-hairline px-2.5 py-1 text-[0.69rem] text-ink-muted">
            {t('week.notBuilt')}
          </span>
        </div>
      </section>
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
