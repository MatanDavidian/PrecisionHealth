import { useState, type FormEvent } from 'react'
import { suggestSlot, type FoodItemInput, type MealInput } from '@/data/newRecords'
import { MEAL_SLOTS, type MealSlot } from '@/domain'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

const emptyItem = (): FoodItemInput => ({
  name: '',
  amount: 0,
  energyKcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
})

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'
const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'

/**
 * ASSUMPTION (docs/OPEN_QUESTIONS.md, Q2): macros are typed by hand. There is no
 * food database yet, so this form is honest about being the manual path — the
 * photo flow in slice 3 is what makes logging fast.
 */
export function MealForm({ onSubmit }: { onSubmit: (input: MealInput) => Promise<void> }) {
  const t = useT()
  const now = new Date()
  const [slot, setSlot] = useState<MealSlot>(suggestSlot(now))
  const [time, setTime] = useState(hhmm(now))
  const [items, setItems] = useState<FoodItemInput[]>([emptyItem()])
  const [saving, setSaving] = useState(false)

  const update = (index: number, patch: Partial<FoodItemInput>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const valid = items.some((item) => item.name.trim().length > 0)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!valid || saving) return
    setSaving(true)

    // The time input gives local wall-clock; combine it with today's date so the
    // instant is built in the device's zone, which is what stamps the record.
    const [hours, minutes] = time.split(':').map(Number)
    const at = new Date()
    at.setHours(hours, minutes, 0, 0)

    try {
      await onSubmit({ slot, at, items: items.filter((item) => item.name.trim().length > 0) })
      setItems([emptyItem()])
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <label className={label} htmlFor="slot">
            {t('log.details.meal')}
          </label>
          <select
            id="slot"
            className={field}
            value={slot}
            onChange={(e) => setSlot(e.target.value as MealSlot)}
          >
            {MEAL_SLOTS.map((option) => (
              <option key={option} value={option}>
                {t(`common.slot.${option}` as StringKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className={label} htmlFor="time">
            {t('log.details.time')}
          </label>
          <input id="time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      {items.map((item, index) => (
        <div key={index} className="rounded-xl border border-hairline p-3">
          <div className="pb-3">
            <label className={label} htmlFor={`name-${index}`}>
              {t('estimate.food')}
            </label>
            <input
              id={`name-${index}`}
              className={field}
              value={item.name}
              placeholder={t('form.foodPlaceholder')}
              onChange={(e) => update(index, { name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <NumberField
              id={`amount-${index}`}
              label={t('estimate.grams')}
              value={item.amount}
              onChange={(amount) => update(index, { amount })}
            />
            <NumberField
              id={`kcal-${index}`}
              label={t('form.kcal')}
              value={item.energyKcal}
              onChange={(energyKcal) => update(index, { energyKcal })}
            />
            <NumberField
              id={`protein-${index}`}
              label={t('estimate.proteinG')}
              value={item.proteinG}
              onChange={(proteinG) => update(index, { proteinG })}
            />
            <NumberField
              id={`carbs-${index}`}
              label={t('estimate.carbsG')}
              value={item.carbsG}
              onChange={(carbsG) => update(index, { carbsG })}
            />
            <NumberField
              id={`fat-${index}`}
              label={t('estimate.fatG')}
              value={item.fatG}
              onChange={(fatG) => update(index, { fatG })}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setItems((current) => [...current, emptyItem()])}
          className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
        >
          {t('nutrition.addAnotherFood')}
        </button>
        <button
          type="submit"
          disabled={!valid || saving}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {saving ? t('estimate.saving') : t('estimate.save')}
        </button>
      </div>
    </form>
  )
}

function NumberField({
  id,
  label: text,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <label className={label} htmlFor={id}>
        {text}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step="any"
        className={`${field} tabular`}
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  )
}
