import { useEffect, useRef, useState } from 'react'
import { billingLink, type BillingAction } from '@/data/billing'
import { buyOnPlay } from '@/data/playBilling'
import type { PlanStatus } from '@/data/plan'
import {
  PLAN_ALLOWANCE,
  PLAN_NAME,
  PLAN_PRICE,
} from '../../../supabase/functions/_shared/plan'
import { Card } from './Card'
import { useLang } from '../i18n'

/** How long to wait for the webhook after Lemon Squeezy sends the buyer back. */
const CONFIRM_POLLS = 10
const CONFIRM_EVERY_MS = 3000

/**
 * The subscription: what it includes, what is left of this month, and the two
 * doors to Lemon Squeezy — subscribe, and manage.
 *
 * After a checkout, Lemon Squeezy sends the buyer back here before its
 * webhook has necessarily arrived. So `justSubscribed` shows a thank-you and
 * re-reads the plan every few seconds until it appears, rather than showing
 * "Subscribe" to someone who has just paid.
 */
/**
 * Where the plan can be bought from here: the website sells it through Lemon
 * Squeezy; inside the Android app only Google Play may (Play's policy), and
 * an old Chrome there cannot offer Play at all.
 */
export type Store = { kind: 'web' } | { kind: 'play'; price?: string } | { kind: 'play-unavailable' }

export function PlanCard({
  signedIn,
  plan,
  justSubscribed,
  refresh,
  onConfirmed,
  store = { kind: 'web' },
}: {
  store?: Store
  signedIn: boolean
  plan?: PlanStatus
  justSubscribed: boolean
  refresh: () => void
  /** Called once the plan has appeared, so the page can drop the return marker. */
  onConfirmed: () => void
}) {
  const { t, lang } = useLang()
  const [busy, setBusy] = useState<BillingAction>()
  const [problem, setProblem] = useState<string>()
  const [polls, setPolls] = useState(0)
  const confirmed = useRef(false)

  useEffect(() => {
    if (!justSubscribed) return
    if (plan) {
      if (!confirmed.current) {
        confirmed.current = true
        onConfirmed()
      }
      return
    }
    if (polls >= CONFIRM_POLLS) return
    const timer = setTimeout(() => {
      refresh()
      setPolls((n) => n + 1)
    }, CONFIRM_EVERY_MS)
    return () => clearTimeout(timer)
  }, [justSubscribed, plan, polls, refresh, onConfirmed])

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'long' })

  const buyInApp = async () => {
    setBusy('checkout')
    setProblem(undefined)
    const result = await buyOnPlay()
    setBusy(undefined)
    if (result.ok) {
      refresh()
      return
    }
    if (result.reason === 'cancelled') return
    setProblem(
      result.reason === 'already_subscribed'
        ? t('settings.alreadySubscribed')
        : result.reason === 'not_signed_in'
          ? t('settings.planSignIn')
          : t('settings.billingUnavailable'),
    )
  }

  const go = async (action: BillingAction) => {
    setBusy(action)
    setProblem(undefined)
    const link = await billingLink(action)
    if (link.ok) {
      window.location.assign(link.url)
      return
    }
    setBusy(undefined)
    setProblem(
      link.reason === 'not_signed_in'
        ? t('settings.planSignIn')
        : link.reason === 'already_subscribed'
          ? t('settings.alreadySubscribed')
          : t('settings.billingUnavailable'),
    )
    if (link.reason === 'already_subscribed') refresh()
  }

  const primary = 'rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40'
  const secondary =
    'rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft disabled:opacity-40'

  return (
    <Card label={t('settings.plan')}>
      {justSubscribed && !plan && (
        <p className="pb-3 text-sm text-leaf" role="status">
          {polls >= CONFIRM_POLLS ? t('settings.billingPending') : t('settings.billingSuccess')}
        </p>
      )}

      {plan ? (
        <>
          <p className="text-sm font-medium">
            {plan.renews
              ? t('settings.planActive', { name: PLAN_NAME, date: date(plan.periodEnd) })
              : t('settings.planCancelled', { name: PLAN_NAME, date: date(plan.periodEnd) })}
          </p>
          {plan.status === 'past_due' && (
            <p className="pt-1 text-sm text-accent">{t('settings.planPastDue')}</p>
          )}
          <ul className="space-y-1 pt-3 text-sm">
            <li>{t('settings.planPhotos', { used: plan.photos.used, allowance: plan.photos.allowance })}</li>
            <li>{t('settings.planTexts', { used: plan.texts.used, allowance: plan.texts.allowance })}</li>
          </ul>
          {plan.renews && (
            <p className="pt-1 text-xs text-ink-muted">
              {t('settings.planResets', { date: date(plan.periodEnd) })}
            </p>
          )}
          {plan.provider === 'lemonsqueezy' && store.kind !== 'web' ? (
            // Bought on the website; inside the Play app it is managed there, not linked to.
            <p className="pt-4 text-xs text-ink-muted">{t('settings.manageOnWeb')}</p>
          ) : (
            <div className="pt-4">
              <button type="button" className={secondary} disabled={Boolean(busy)} onClick={() => void go('portal')}>
                {busy === 'portal' ? t('settings.billingWait') : t('settings.manage')}
              </button>
              <p className="pt-2 text-xs text-ink-muted">
                {plan.provider === 'google_play' ? t('settings.manageNotePlay') : t('settings.manageNote')}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {store.kind === 'web' || (store.kind === 'play' && store.price)
              ? t('settings.planPitch', {
                  name: PLAN_NAME,
                  photos: PLAN_ALLOWANCE.PHOTO,
                  texts: PLAN_ALLOWANCE.TEXT,
                  price: store.kind === 'play' ? store.price! : PLAN_PRICE,
                })
              : t('settings.planPitchNoPrice', {
                  name: PLAN_NAME,
                  photos: PLAN_ALLOWANCE.PHOTO,
                  texts: PLAN_ALLOWANCE.TEXT,
                })}
          </p>
          <div className="pt-4">
            {store.kind === 'play-unavailable' ? (
              <p className="text-sm">{t('settings.playUnavailable')}</p>
            ) : store.kind === 'play' && signedIn ? (
              <>
                <button type="button" className={primary} disabled={Boolean(busy)} onClick={() => void buyInApp()}>
                  {busy === 'checkout'
                    ? t('settings.billingWait')
                    : store.price
                      ? t('settings.subscribe', { price: store.price })
                      : t('settings.subscribePlay')}
                </button>
                <p className="pt-2 text-xs text-ink-muted">{t('settings.subscribeNotePlay')}</p>
              </>
            ) : signedIn ? (
              <button
                type="button"
                className={primary}
                disabled={Boolean(busy) || (justSubscribed && polls < CONFIRM_POLLS)}
                onClick={() => void go('checkout')}
              >
                {busy === 'checkout' ? t('settings.billingWait') : t('settings.subscribe', { price: PLAN_PRICE })}
              </button>
            ) : (
              <p className="text-sm">{t('settings.planSignIn')}</p>
            )}
            {store.kind === 'web' && <p className="pt-2 text-xs text-ink-muted">{t('settings.subscribeNote')}</p>}
          </div>
        </>
      )}

      {problem && (
        <p className="pt-3 text-sm text-accent" role="alert">
          {problem}
        </p>
      )}
    </Card>
  )
}
