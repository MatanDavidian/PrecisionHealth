import { useEffect, useState } from 'react'
import { readUsuals, type Usuals } from '@/data/usuals'
import { currentUserId } from '@/data/session'
import { deviceZone } from '@/data/newRecords'
import {
  MEAL_SLOTS,
  convert,
  zonedTimeToUtc,
  type CalendarDate,
  type MealSlot,
  type UsualMeal,
} from '@/domain'
import { useT } from '../i18n'
import { fieldClass as field, labelClass as label } from './NumberField'
import type { StringKey } from '../i18n/strings'

const slotKey = (slot: MealSlot): StringKey => `common.slot.${slot}` as StringKey

const kcalOf = (meal: UsualMeal['template']): number =>
  Math.round(meal.items.reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0))

/**
 * Logging something you have eaten before, onto the day on screen.
 *
 * The Log screen has had this since slice 3.6, but only ever onto today,
 * because the whole Log screen means now. The combination that was missing is
 * the likeliest reason to be looking at yesterday at all: repeat something you
 * eat often, onto the day you forgot.
 *
 * The same usuals the Log screen offers, ranked for the slot being logged
 * rather than the hour it happens to be — adding yesterday's breakfast at nine
 * in the evening should still offer breakfasts.
 */
export function RepeatMeal({
  day,
  dayName,
  onRepeat,
  onCancel,
}: {
  day: CalendarDate
  /** "Yesterday", "Today" — the button says where the meal is going. */
  dayName: string
  onRepeat: (input: { usual: UsualMeal; at: Date; slot: MealSlot }) => Promise<unknown>
  onCancel: () => void
}) {
  const t = useT()
  const [slot, setSlot] = useState<MealSlot>('LUNCH')
  const [time, setTime] = useState('12:30')
  const [usuals, setUsuals] = useState<Usuals>()
  const [saving, setSaving] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void readUsuals(currentUserId(), slot)
      .then((found) => !cancelled && setUsuals(found))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [slot])

  /*
    The ones eaten at this slot first, then everything else — with duplicates
    dropped, since a usual that is also this slot's favourite should appear
    once, at the top.
  */
  const options: UsualMeal[] = usuals
    ? [
        ...usuals.forThisSlot,
        ...usuals.all.filter((m) => !usuals.forThisSlot.some((s) => s.signature === m.signature)),
      ]
    : []

  if (usuals && options.length === 0) {
    return (
      <div className="grid gap-3">
        <p className="max-w-[46ch] text-sm text-ink-soft">{t('repeat.nothingYet')}</p>
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {t('editor.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="repeat-slot">
            {t('log.details.meal')}
          </label>
          <select
            id="repeat-slot"
            className={field}
            value={slot}
            onChange={(e) => setSlot(e.target.value as MealSlot)}
          >
            {MEAL_SLOTS.map((option) => (
              <option key={option} value={option}>
                {t(slotKey(option))}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="repeat-time">
            {t('log.details.time')}
          </label>
          <input
            id="repeat-time"
            type="time"
            className={field}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      {!usuals && <p className="text-sm text-ink-muted">{t('usuals.looking')}</p>}

      {options.map((usual) => (
        <button
          key={usual.signature}
          type="button"
          disabled={saving !== undefined}
          onClick={() => {
            setSaving(usual.signature)
            void onRepeat({
              usual,
              // The typed time on the day being logged, not on today (D7).
              at: new Date(zonedTimeToUtc(day, time, deviceZone())),
              slot,
            }).finally(() => setSaving(undefined))
          }}
          className="rounded-card border border-hairline bg-surface p-3 text-start transition-colors hover:border-accent disabled:opacity-40"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium" dir="auto">
              {usual.template.items.map((item) => item.name).join(' · ')}
            </span>
            <span className="tabular ltr-nums text-sm">
              {saving === usual.signature ? t('estimate.saving') : `${kcalOf(usual.template)} kcal`}
            </span>
          </div>
          {/*
            Enough to tell two similar meals apart: how often, how recently, and
            whether its numbers were ever checked by a human.
          */}
          <p className="pt-1 text-xs text-ink-muted">
            {t('repeat.seenBefore', {
              count: usual.count,
              slot: t(slotKey(usual.slot)),
            })}
            {!usual.confirmed && ` · ${t('repeat.unconfirmed')}`}
          </p>
        </button>
      ))}

      <div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
        >
          {t('editor.cancel')}
        </button>
      </div>
      <p className="text-xs text-ink-muted">{t('repeat.addsTo', { day: dayName })}</p>
    </div>
  )
}
