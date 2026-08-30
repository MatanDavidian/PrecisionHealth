import { useMemo, useState, type FormEvent } from 'react'
import {
  MEAL_SLOTS,
  changesAnything,
  dayKey,
  canRefill,
  editableItem,
  liveItems,
  needsConfirmation,
  refill,
  scaleTo,
  timeOfDay,
  zonedTimeToUtc,
  type FoodItemEdit,
  type FoodItemId,
  type IanaZone,
  type Meal,
  type MealEdit,
  type MealSlot,
} from '@/domain'
import { deviceZone } from '@/data/newRecords'
import { NumberField, fieldClass as field, labelClass as label } from './NumberField'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

/**
 * The zone the meal was logged in, not the one the phone is in now.
 *
 * Correcting the time of a dinner eaten in another country must not reinterpret
 * "20:30" in the zone you happen to be standing in today (D7).
 */
const zoneOf = (meal: Meal): IanaZone =>
  meal.time.kind === 'instant' ? meal.time.zone : deviceZone()

const slotKey = (slot: MealSlot): StringKey => `common.slot.${slot}` as StringKey

/** Where the numbers on screen came from, said plainly. */
function originKey(meal: Meal): StringKey {
  const items = liveItems(meal.items)
  const estimated = items.some((item) => item.provenance.source === 'AI_ESTIMATE')
  const unconfirmed = items.some((item) => needsConfirmation(item.provenance))
  if (!estimated) return 'editor.originHand'
  return unconfirmed ? 'editor.originUnconfirmed' : 'editor.originConfirmed'
}

/**
 * Correcting a meal that is already logged.
 *
 * The commonest correction by far is the portion — the model saw 320 g and it
 * was nearer 260 — so changing the grams re-scales the rest by ratio and says
 * so. Typing over any other number simply overwrites it; there is no mode to
 * leave, because a mode you have to notice is one people get stuck in.
 *
 * Saving writes a new version of the meal (D15) with each changed food
 * superseding the old one (D4). Nothing is overwritten, so an edit is as
 * undoable as everything else here — and the version that was there before is
 * still readable.
 */
export function MealEditor({
  meal,
  onSave,
  onCancel,
  onDelete,
}: {
  meal: Meal
  onSave: (edit: MealEdit) => Promise<void>
  onCancel: () => void
  onDelete: () => void
}) {
  const t = useT()
  const zone = zoneOf(meal)
  const [items, setItems] = useState<FoodItemEdit[]>(() => liveItems(meal.items).map(editableItem))
  const [removed, setRemoved] = useState<FoodItemId[]>([])
  const [slot, setSlot] = useState<MealSlot>(meal.slot)
  const [time, setTime] = useState(() => timeOfDay(meal, zone))
  const [scaled, setScaled] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  /**
   * What each food looked like when the form opened.
   *
   * Refill is easy to press twice by accident and its effect compounds, so
   * there has to be a way back that is not "cancel the whole edit and start
   * again". Kept per item, because each is portioned on its own.
   */
  const saved = useMemo(
    () => new Map(liveItems(meal.items).map(editableItem).map((item) => [String(item.id), item])),
    [meal],
  )

  const remaining = items.filter((item) => !removed.includes(item.id))

  const update = (id: FoodItemId, patch: Partial<FoodItemEdit>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )

  /** Changing the weight carries the numbers with it, and says which ones moved. */
  const reportion = (id: FoodItemId, amountG: number) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? scaleTo(item, amountG) : item)),
    )
    setScaled((current) => (current.includes(id) ? current : [...current, id]))
  }

  /** Ten percent more food, and the macros follow — the arithmetic is domain. */
  const addTenPercent = (id: FoodItemId) => {
    setItems((current) => current.map((item) => (item.id === id ? refill(item) : item)))
    setScaled((current) => (current.includes(id) ? current : [...current, id]))
  }

  /** Back to the portion as saved, macros and all. */
  const revert = (id: FoodItemId) => {
    const original = saved.get(String(id))
    if (!original) return
    setItems((current) => current.map((item) => (item.id === id ? original : item)))
    setScaled((current) => current.filter((scaledId) => scaledId !== id))
  }

  const edit = (): MealEdit => ({
    items: remaining,
    removed,
    slot: slot === meal.slot ? undefined : slot,
    at: time === timeOfDay(meal, zone) ? undefined : atOn(meal, time),
  })

  const dirty = changesAnything(meal, edit())

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!dirty) return onCancel()
    // A meal with no food in it is not a meal. Removing the last one means
    // "delete this", so do that rather than leaving an empty row on the day.
    if (remaining.length === 0) return onDelete()
    setSaving(true)
    try {
      await onSave(edit())
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="my-2 rounded-card border border-hairline bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm font-medium">
          {t('editor.editing', { slot: t(slotKey(meal.slot)) })}
        </p>
        <p className="text-xs text-ink-muted">
          {t('editor.loggedAt', { time: timeOfDay(meal, zone), origin: t(originKey(meal)) })}
        </p>
      </div>

      {remaining.length === 0 && (
        <p className="pt-3 text-sm text-accent">{t('editor.allRemoved')}</p>
      )}

      {items.map((item) => {
        const gone = removed.includes(item.id)
        return (
          <div
            key={item.id}
            className={`mt-4 border-t border-hairline pt-4 first:mt-3 ${gone ? 'opacity-50' : ''}`}
          >
            {/*
              The design's grid: as many 132px columns as fit, each food name
              spanning the lot. It replaces a fixed four-column layout that had
              carbs and fat sharing one cell — which worked until Refill needed
              room beside the grams, and then squeezed that field to nothing and
              clipped the last two.
            */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(132px,1fr))]">
              <div className="col-span-full">
                <label className={label} htmlFor={`name-${item.id}`}>
                  {t('estimate.food')}
                </label>
                <input
                  id={`name-${item.id}`}
                  className={field}
                  value={item.name}
                  disabled={gone}
                  onChange={(e) => update(item.id, { name: e.target.value })}
                />
              </div>
              <NumberField
                id={`grams-${item.id}`}
                label={t('estimate.grams')}
                value={item.amountG}
                disabled={gone}
                highlight={scaled.includes(item.id)}
                onChange={(amountG) => reportion(item.id, amountG)}
                trailing={
                  <button
                    type="button"
                    onClick={() => addTenPercent(item.id)}
                    disabled={gone || !canRefill(item)}
                    title={t('editor.refillTitle')}
                    className="flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-lg border border-hairline bg-surface px-[11px] text-xs font-medium text-ink-soft transition-colors hover:border-accent hover:bg-card-soft hover:text-accent disabled:opacity-40 disabled:hover:border-hairline disabled:hover:bg-surface disabled:hover:text-ink-soft"
                  >
                    <RefillIcon />
                    {t('editor.refill')}
                  </button>
                }
              />
              <NumberField
                id={`kcal-${item.id}`}
                label={t('estimate.calories')}
                value={item.energyKcal}
                disabled={gone}
                onChange={(energyKcal) => update(item.id, { energyKcal })}
              />
              <NumberField
                id={`protein-${item.id}`}
                label={t('estimate.proteinG')}
                value={item.proteinG}
                disabled={gone}
                onChange={(proteinG) => update(item.id, { proteinG })}
              />
              <NumberField
                id={`carbs-${item.id}`}
                label={t('estimate.carbsG')}
                value={item.carbsG}
                disabled={gone}
                onChange={(carbsG) => update(item.id, { carbsG })}
              />
              <NumberField
                id={`fat-${item.id}`}
                label={t('estimate.fatG')}
                value={item.fatG}
                disabled={gone}
                onChange={(fatG) => update(item.id, { fatG })}
              />
            </div>

            <div className="flex flex-wrap items-baseline gap-4 pt-2">
              <button
                type="button"
                onClick={() =>
                  setRemoved((current) =>
                    gone ? current.filter((id) => id !== item.id) : [...current, item.id],
                  )
                }
                className="text-xs text-ink-muted underline"
              >
                {gone ? t('estimate.keepFood') : t('estimate.removeFood')}
              </button>
              {/* Only once this food actually moved, and it names the number it
                  goes back to so the way out is legible before it is taken. */}
              {!gone && scaled.includes(item.id) && (
                <button
                  type="button"
                  onClick={() => revert(item.id)}
                  className="text-xs text-accent underline"
                >
                  {t('editor.backTo', { grams: saved.get(String(item.id))?.amountG ?? 0 })}
                </button>
              )}
            </div>
          </div>
        )
      })}

      <div className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`slot-${meal.id}`}>
            {t('log.details.meal')}
          </label>
          <select
            id={`slot-${meal.id}`}
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
          <label className={label} htmlFor={`time-${meal.id}`}>
            {t('log.details.time')}
          </label>
          <input
            id={`time-${meal.id}`}
            type="time"
            className={field}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      {scaled.length > 0 && (
        <p className="pt-3 text-xs text-ink-muted">{t('editor.ratioHint')}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {saving ? t('estimate.saving') : t('editor.saveChanges')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
        >
          {t('editor.cancel')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ms-auto flex items-center gap-2 rounded-full border border-accent-soft px-4 py-2 text-sm text-accent transition-colors hover:bg-accent-soft"
        >
          <TrashIcon />
          {t('editor.delete')}
        </button>
      </div>
    </form>
  )
}

/**
 * The instant a wall-clock time means, on the day the meal already belongs to.
 *
 * Resolved in the meal's own date and zone rather than today's and the
 * device's, so correcting the time of yesterday's dinner does not quietly move
 * it onto today, or shift it by an hour because you have since flown (D7).
 */
function atOn(meal: Meal, hhmm: string): string {
  if (meal.time.kind !== 'instant') return new Date().toISOString()
  return zonedTimeToUtc(dayKey(meal.time.at, meal.time.zone), hhmm, meal.time.zone)
}

/** The design's refresh arrow: a circle that comes back round to itself. */
function RefillIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      aria-hidden
    >
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  )
}
