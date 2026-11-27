import { useEffect, useState } from 'react'
import { CALIBRATION_DAYS, MIN_COMPLETE_DAYS, MIN_WEIGH_INS, dismissedRecently, type BurnCalibration, type Calibration } from '@/domain'
import { currentUserId } from '@/data/session'
import { readCalibration } from '@/data/precision'
import { Card } from './Card'
import { useDataRevision } from '../DataProvider'
import { useLang } from '../i18n'

/**
 * Your burn, from your weight (meal-suggestions-precision.md §5.4, Phase 5).
 *
 * In Settings → Goals. The weight trend, read over the last 28 days, says
 * what the person really burns. A correction is only ever offered, never
 * applied: it needs 28 days of sufficiently complete logging and weigh-ins, a
 * persistent gap of 10% or more, and the person's "Use it". Applied, it says
 * so, and "Stop using it" goes back to the burn as measured.
 */
export function BurnFromWeight({
  applied,
  dismissedAt,
  onApprove,
  onDismiss,
  onStop,
}: {
  applied?: BurnCalibration
  dismissedAt?: string
  onApprove: (calibration: BurnCalibration) => Promise<unknown>
  onDismiss: () => Promise<unknown>
  onStop: () => Promise<unknown>
}) {
  const { t, lang } = useLang()
  const { revision } = useDataRevision()
  const [reading, setReading] = useState<Calibration>()
  const [busy, setBusy] = useState(false)
  const fmt = (n: number) => Math.round(n).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')
  const pct = (n: number) => `${Math.round(Math.abs(n) * 100)}%`

  useEffect(() => {
    let cancelled = false
    void readCalibration(currentUserId())
      .then((found) => !cancelled && setReading(found))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [revision])

  const run = (action: () => Promise<unknown>) => {
    setBusy(true)
    void action().finally(() => setBusy(false))
  }

  if (!reading) return null

  return (
    <Card label={t('burnTrend.title')}>
      <div className="grid gap-2 text-sm leading-relaxed" data-testid="burn-from-weight">
        {applied && (
          <>
            <p data-testid="burn-applied">
              {t('burnTrend.applied', {
                factor: applied.factor.toFixed(2),
                trend: fmt(applied.trendKcal),
                used: fmt(applied.usedKcal),
                date: new Date(applied.approvedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
                  day: 'numeric',
                  month: 'long',
                }),
              })}
            </p>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(onStop)}
                className="rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm"
              >
                {t('burnTrend.stop')}
              </button>
            </div>
          </>
        )}

        {reading.status === 'OFFER' && !dismissedRecently(dismissedAt, new Date()) && (
          <div className="rounded-xl bg-card-soft px-3.5 py-3" data-testid="burn-offer">
            <p>
              {t(reading.discrepancy < 0 ? 'burnTrend.offerLess' : 'burnTrend.offerMore', {
                trend: fmt(reading.trendKcal),
                used: fmt(reading.usedKcal),
                pct: pct(reading.discrepancy),
              })}
            </p>
            <p className="pt-1 text-xs text-ink-muted">{t('burnTrend.offerHow')}</p>
            <div className="flex flex-wrap gap-2 pt-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    onApprove({
                      // On top of a correction already in use: they multiply.
                      factor: Math.round((applied?.factor ?? 1) * reading.factor * 100) / 100,
                      trendKcal: reading.trendKcal,
                      usedKcal: reading.usedKcal,
                      approvedAt: new Date().toISOString(),
                    }),
                  )
                }
                className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-canvas"
              >
                {t('burnTrend.use', { trend: fmt(reading.trendKcal) })}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(onDismiss)}
                className="rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm"
              >
                {t('burnTrend.notNow')}
              </button>
            </div>
          </div>
        )}

        {reading.status === 'OFFER' && dismissedRecently(dismissedAt, new Date()) && (
          <p className="text-ink-soft" data-testid="burn-dismissed">{t('burnTrend.dismissed')}</p>
        )}
        {reading.status === 'AGREES' && (
          <p className="text-ink-soft" data-testid="burn-agrees">
            {t('burnTrend.agrees', { trend: fmt(reading.trendKcal), used: fmt(reading.usedKcal) })}
          </p>
        )}
        {reading.status === 'UNCLEAR' && (
          <p className="text-ink-soft" data-testid="burn-unclear">{t('burnTrend.unclear')}</p>
        )}
        {reading.status === 'NOT_ENOUGH' && (
          <p className="text-ink-soft" data-testid="burn-not-enough">
            {t('burnTrend.notEnough', {
              days: fmt(CALIBRATION_DAYS),
              complete: fmt(Math.min(reading.completeDays, MIN_COMPLETE_DAYS)),
              need: fmt(MIN_COMPLETE_DAYS),
              weighIns: fmt(Math.min(reading.weighIns, MIN_WEIGH_INS)),
              needWeighIns: fmt(MIN_WEIGH_INS),
            })}
          </p>
        )}
      </div>
    </Card>
  )
}
