import { useState, type FormEvent } from 'react'
import {
  MEAL_SLOTS,
  changesAnything,
  dayKey,
  editableItem,
  liveItems,
  needsConfirmation,
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

/**
 * The zone the meal was logged in, not the one the phone is in now.
 *
 * Correcting the time of a dinner eaten in another country must not reinterpret
 * "20:30" in the zone you happen to be standing in today (D7).
 */
const zoneOf = (meal: Meal): IanaZone =>
  meal.time.kind === 'instant' ? meal.time.zone : deviceZone()

const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'
const field =
  'w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-accent'

const slotWord = (slot: MealSlot) => slot.charAt(0) + slot.slice(1).toLowerCase()

/** Where the numbers on screen came from, said plainly. */
function origin(meal: Meal): string {
  const items = liveItems(meal.items)
  const estimated = items.some((item) => item.provenance.source === 'AI_ESTIMATE')
  const unconfirmed = items.some((item) => needsConfirmation(item.provenance))
  if (!estimated) return 'entered by hand'
  return unconfirmed ? 'estimated, not yet confirmed' : 'from an estimate you confirmed'
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
  const zone = zoneOf(meal)
  const [items, setItems] = useState<FoodItemEdit[]>(() => liveItems(meal.items).map(editableItem))
  const [removed, setRemoved] = useState<FoodItemId[]>([])
  const [slot, setSlot] = useState<MealSlot>(meal.slot)
  const [time, setTime] = useState(() => timeOfDay(meal, zone))
  const [scaled, setScaled] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

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
        <p className="text-sm font-medium">Editing {slotWord(meal.slot).toLowerCase()}</p>
        <p className="text-xs text-ink-muted">
          Logged {timeOfDay(meal, zone)}, {origin(meal)}
        </p>
      </div>

      {remaining.length === 0 && (
        <p className="pt-3 text-sm text-accent">
          Every food is removed — saving now deletes the meal. It can be undone.
        </p>
      )}

      {items.map((item) => {
        const gone = removed.includes(item.id)
        return (
          <div
            key={item.id}
            className={`mt-4 border-t border-hairline pt-4 first:mt-3 ${gone ? 'opacity-50' : ''}`}
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-4">
                <label className={label} htmlFor={`name-${item.id}`}>
                  Food
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
                label="Grams"
                value={item.amountG}
                disabled={gone}
                highlight={scaled.includes(item.id)}
                onChange={(amountG) => reportion(item.id, amountG)}
              />
              <NumberField
                id={`kcal-${item.id}`}
                label="Calories"
                value={item.energyKcal}
                disabled={gone}
                onChange={(energyKcal) => update(item.id, { energyKcal })}
              />
              <NumberField
                id={`protein-${item.id}`}
                label="Protein g"
                value={item.proteinG}
                disabled={gone}
                onChange={(proteinG) => update(item.id, { proteinG })}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id={`carbs-${item.id}`}
                  label="Carbs g"
                  value={item.carbsG}
                  disabled={gone}
                  onChange={(carbsG) => update(item.id, { carbsG })}
                />
                <NumberField
                  id={`fat-${item.id}`}
                  label="Fat g"
                  value={item.fatG}
                  disabled={gone}
                  onChange={(fatG) => update(item.id, { fatG })}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setRemoved((current) =>
                  gone ? current.filter((id) => id !== item.id) : [...current, item.id],
                )
              }
              className="pt-2 text-xs text-ink-muted underline"
            >
              {gone ? 'Keep this food' : 'Remove this food'}
            </button>
          </div>
        )
      })}

      <div className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`slot-${meal.id}`}>
            Meal
          </label>
          <select
            id={`slot-${meal.id}`}
            className={field}
            value={slot}
            onChange={(e) => setSlot(e.target.value as MealSlot)}
          >
            {MEAL_SLOTS.map((option) => (
              <option key={option} value={option}>
                {slotWord(option)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`time-${meal.id}`}>
            Time
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
        <p className="pt-3 text-xs text-ink-muted">
          Change the grams and the rest follows by ratio. Type over any number to break the link.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex items-center gap-2 rounded-full border border-accent-soft px-4 py-2 text-sm text-accent transition-colors hover:bg-accent-soft"
        >
          <TrashIcon />
          Delete meal
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

function NumberField({
  id,
  label: text,
  value,
  onChange,
  disabled,
  highlight,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  highlight?: boolean
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
        disabled={disabled}
        className={`${field} tabular ${highlight ? 'border-accent' : ''}`}
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
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
