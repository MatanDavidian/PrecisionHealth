import { useState } from 'react'
import { getEstimator } from '@/data'
import { deviceZone } from '@/data/newRecords'
import { correctionsFrom, type EstimateCorrection } from '@/data/estimatedMeal'
import type { EstimateResult } from '@/ai/estimator'
import { MEAL_SLOTS, zonedTimeToUtc, type CalendarDate, type MealSlot } from '@/domain'
import { EstimateCard } from './log/EstimateCard'
import { AdjustPanel } from './log/AdjustPanel'
import { useLang } from '../i18n'
import { fieldClass as field, labelClass as label } from './NumberField'
import type { StringKey } from '../i18n/strings'

const slotKey = (slot: MealSlot): StringKey => `common.slot.${slot}` as StringKey

/**
 * A meal described in words, for whichever day is on screen.
 *
 * The same estimator the Log screen's Write mode uses, and the same card to
 * show the answer — the only thing that differs is which day it lands on. That
 * is the whole point of it living here: the Log screen always means "now", and
 * the thing you actually want to describe is usually the meal you forgot.
 */
export function DescribeMeal({
  day,
  dayName,
  onSaved,
  onCancel,
}: {
  day: CalendarDate
  /** "Yesterday", "Today" — the button says where the meal is going. */
  dayName: string
  onSaved: (input: {
    slot: MealSlot
    at: Date
    description: string
    result: EstimateResult
    corrections?: EstimateCorrection[]
  }) => Promise<unknown>
  onCancel: () => void
}) {
  const { t, lang } = useLang()
  const [description, setDescription] = useState('')
  const [slot, setSlot] = useState<MealSlot>('LUNCH')
  const [time, setTime] = useState('12:30')
  const [state, setState] = useState<
    { kind: 'writing' } | { kind: 'estimating' } | { kind: 'failed'; message: string }
  >({ kind: 'writing' })
  const [result, setResult] = useState<EstimateResult>()
  const [rows, setRows] = useState<EstimateCorrection[]>([])
  const [adjusting, setAdjusting] = useState(false)
  const [saving, setSaving] = useState(false)

  async function estimate() {
    if (!description.trim()) return
    setState({ kind: 'estimating' })
    try {
      const estimated = await getEstimator().estimateFromText(description.trim(), { language: lang })
      setResult(estimated)
      setRows(correctionsFrom(estimated))
      setState({ kind: 'writing' })
    } catch (cause) {
      setState({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  async function save(corrections?: EstimateCorrection[]) {
    if (!result) return
    setSaving(true)
    try {
      await onSaved({
        slot,
        // The typed time on the day being logged, not on today (D7).
        at: new Date(zonedTimeToUtc(day, time, deviceZone())),
        description: description.trim(),
        result,
        corrections,
      })
    } finally {
      setSaving(false)
    }
  }

  if (result && adjusting) {
    return (
      <AdjustPanel
        result={result}
        rows={rows}
        onChange={setRows}
        saving={saving}
        onSave={() => void save(rows)}
        onBack={() => setAdjusting(false)}
      />
    )
  }

  if (result) {
    return (
      <>
        <div className="grid gap-3 pb-3 sm:grid-cols-2">
          <SlotAndTime {...{ slot, setSlot, time, setTime, t }} />
        </div>
        <EstimateCard
          result={result}
          fromText
          rows={rows}
          saving={saving}
          onSave={save}
          onAdjust={() => setAdjusting(true)}
          onDiscard={() => {
            setResult(undefined)
            setRows([])
          }}
          saveLabel={t('describe.addTo', { day: dayName })}
        />
      </>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SlotAndTime {...{ slot, setSlot, time, setTime, t }} />
      </div>
      <div>
        <label className={label} htmlFor="describe-meal">
          {t('describe.label')}
        </label>
        <textarea
          id="describe-meal"
          rows={3}
          dir="auto"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('describe.placeholder')}
          className={`${field} resize-y`}
        />
      </div>

      {state.kind === 'failed' && (
        <p className="text-sm text-accent" dir="auto">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={estimate}
          disabled={!description.trim() || state.kind === 'estimating'}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {state.kind === 'estimating' ? t('describe.estimating') : t('describe.estimate')}
        </button>
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

/** Which meal, and when — the two things words rarely say. */
function SlotAndTime({
  slot,
  setSlot,
  time,
  setTime,
  t,
}: {
  slot: MealSlot
  setSlot: (slot: MealSlot) => void
  time: string
  setTime: (time: string) => void
  t: (key: StringKey, vars?: Record<string, string | number>) => string
}) {
  return (
    <>
      <div>
        <label className={label} htmlFor="describe-slot">
          {t('log.details.meal')}
        </label>
        <select
          id="describe-slot"
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
        <label className={label} htmlFor="describe-time">
          {t('log.details.time')}
        </label>
        <input
          id="describe-time"
          type="time"
          className={field}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
    </>
  )
}
