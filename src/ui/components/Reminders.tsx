import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DEFAULT_REMINDER_TIME,
  keepReminderZone,
  notificationPermission,
  pushSupport,
  readReminderPrefs,
  remindersDeployed,
  REMINDER_TIMES,
  reminderKey,
  saveReminderPrefs,
  sendTestReminder,
  subscribeThisDevice,
  thisDeviceSubscribed,
  unsubscribeThisDevice,
  type ReminderPrefs,
} from '@/data/reminders'
import type { Session } from '@/data/session'
import { Card } from './Card'
import { useLang } from '../i18n'

/**
 * Settings: reminders (docs/features/reminders.md).
 *
 * Off until switched on: the permission prompt needs a tap anyway, and a
 * reminder nobody asked for is the quickest way to be uninstalled. Turning
 * one on asks this device for permission and subscribes it; turning both off
 * stops this device. Other devices keep their own subscription, and stop
 * hearing anything once both reminders are off for the account.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  /** The server side is not there (not yet deployed): no card at all. */
  | { kind: 'unavailable' }
  | { kind: 'ready'; publicKey: string; prefs: ReminderPrefs; here: boolean }

type Notice = 'denied' | 'saveFailed' | 'testSent' | 'testNone' | 'testFailed' | undefined

/** An on/off switch: a button that says what it is and whether it is on. */
function Switch({
  label,
  note,
  on,
  busy,
  onChange,
}: {
  label: string
  note: string
  on: boolean
  busy: boolean
  onChange: (next: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-label`} className="text-sm font-medium">
          {label}
        </p>
        <p id={`${id}-note`} className="pt-0.5 text-xs leading-relaxed text-ink-muted">
          {note}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-note`}
        disabled={busy}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          on ? 'bg-ink' : 'border border-hairline bg-surface'
        }`}
      >
        <span
          aria-hidden
          className={`inline-block size-5 rounded-full shadow-sm transition-transform ${
            on ? 'translate-x-6 bg-canvas rtl:-translate-x-6' : 'translate-x-1 bg-ink-muted rtl:-translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

export function Reminders({ session }: { session: Session }) {
  const { t, lang } = useLang()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>()
  const timeId = useId()

  useEffect(() => {
    let cancelled = false
    if (!session.authenticated) {
      // Said only once reminders exist: a card for a feature not yet live would be a promise.
      void remindersDeployed().then((deployed) => {
        if (!cancelled) setState({ kind: deployed ? 'signed-out' : 'unavailable' })
      })
      return () => {
        cancelled = true
      }
    }
    void (async () => {
      const [publicKey, prefs, here] = await Promise.all([
        reminderKey(),
        readReminderPrefs(session.userId),
        thisDeviceSubscribed(),
      ])
      if (cancelled) return
      if (!publicKey) return setState({ kind: 'unavailable' })
      setState({ kind: 'ready', publicKey, prefs: prefs ?? { meal: false, watch: false, time: DEFAULT_REMINDER_TIME }, here })
      // Opened somewhere new: the reminder follows to the new zone.
      void keepReminderZone(session.userId)
    })()
    return () => {
      cancelled = true
    }
  }, [session.authenticated, session.userId])

  if (state.kind === 'loading' || state.kind === 'unavailable') return null

  if (state.kind === 'signed-out') {
    return (
      <Card label={t('reminders.title')}>
        <p className="max-w-[60ch] text-sm leading-relaxed text-ink-soft">{t('reminders.needAccount')}</p>
        <Link to="/signin?next=/settings" className="mt-3 inline-flex text-sm font-medium underline underline-offset-2">
          {t('reminders.signIn')}
        </Link>
      </Card>
    )
  }

  const support = pushSupport()
  const blocked = notificationPermission() === 'denied'
  const { prefs, here, publicKey } = state

  /** Saves the account's choice; switching one on first makes sure this device can hear it. */
  async function change(next: ReminderPrefs) {
    setBusy(true)
    setNotice(undefined)
    try {
      const turningOn = (next.meal || next.watch) && !here
      if (turningOn) {
        const result = await subscribeThisDevice(publicKey)
        if (result !== 'ok') {
          setNotice(result === 'denied' ? 'denied' : 'saveFailed')
          return
        }
      }
      if (!(await saveReminderPrefs(session.userId, next))) {
        setNotice('saveFailed')
        return
      }
      const bothOff = !next.meal && !next.watch
      if (bothOff && here) await unsubscribeThisDevice()
      setState({ kind: 'ready', publicKey, prefs: next, here: bothOff ? false : here || turningOn })
    } finally {
      setBusy(false)
    }
  }

  async function addThisDevice() {
    setBusy(true)
    setNotice(undefined)
    const result = await subscribeThisDevice(publicKey)
    setBusy(false)
    if (result === 'ok') setState({ kind: 'ready', publicKey, prefs, here: true })
    else setNotice(result === 'denied' ? 'denied' : 'saveFailed')
  }

  async function test() {
    setBusy(true)
    setNotice(undefined)
    const result = await sendTestReminder(lang)
    setBusy(false)
    setNotice(result === 'sent' ? 'testSent' : result === 'none' ? 'testNone' : 'testFailed')
  }

  const unusable = support !== 'supported' || blocked
  return (
    <div id="reminders" className="scroll-mt-4">
      <Card label={t('reminders.title')}>
        {support === 'ios-home-screen' && (
          <p className="mb-4 max-w-[60ch] rounded-2xl bg-surface p-3.5 text-sm leading-relaxed">{t('reminders.iosHomeScreen')}</p>
        )}
        {support === 'unsupported' && (
          <p className="mb-4 max-w-[60ch] rounded-2xl bg-surface p-3.5 text-sm leading-relaxed">{t('reminders.unsupported')}</p>
        )}
        {(blocked || notice === 'denied') && support === 'supported' && (
          <p role="alert" className="mb-4 max-w-[60ch] rounded-2xl bg-surface p-3.5 text-sm leading-relaxed">
            {t('reminders.denied')}
          </p>
        )}

        <div className="grid gap-5">
          <Switch
            label={t('reminders.meal')}
            note={t('reminders.mealNote')}
            on={prefs.meal}
            busy={busy || (unusable && !prefs.meal)}
            onChange={(meal) => void change({ ...prefs, meal })}
          />
          <div className="flex items-center gap-3 ps-0.5">
            <label htmlFor={timeId} className="text-sm text-ink-soft">
              {t('reminders.at')}
            </label>
            <select
              id={timeId}
              value={prefs.time}
              disabled={busy}
              onChange={(e) => void change({ ...prefs, time: e.target.value })}
              className="tabular ltr-nums rounded-xl border border-hairline bg-surface px-3 py-2 text-sm"
            >
              {REMINDER_TIMES.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
          <Switch
            label={t('reminders.watch')}
            note={t('reminders.watchNote')}
            on={prefs.watch}
            busy={busy || (unusable && !prefs.watch)}
            onChange={(watch) => void change({ ...prefs, watch })}
          />
        </div>

        {(prefs.meal || prefs.watch) && !here && support === 'supported' && !blocked && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3.5">
            <p className="text-sm">{t('reminders.notHere')}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void addThisDevice()}
              className="rounded-full border border-ink px-4 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              {t('reminders.addHere')}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-5">
          <button
            type="button"
            disabled={busy || (!prefs.meal && !prefs.watch)}
            onClick={() => void test()}
            className="rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {busy ? t('reminders.working') : t('reminders.test')}
          </button>
          {notice && notice !== 'denied' && (
            <p role="status" className="text-sm text-ink-soft">
              {t(`reminders.${notice}`)}
            </p>
          )}
        </div>

        <p className="max-w-[60ch] pt-4 text-xs leading-relaxed text-ink-muted">{t('reminders.privacy')}</p>
      </Card>
    </div>
  )
}
