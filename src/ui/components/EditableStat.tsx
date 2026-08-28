import { useState, type FormEvent } from 'react'
import { useT } from '../i18n'

/**
 * A figure on the dashboard that the user can type in themselves.
 *
 * The whole row is the affordance rather than a pencil icon in the corner: on
 * a phone these are the two numbers most likely to be entered daily, and
 * hunting for a 26px target to do a routine thing is the wrong trade.
 *
 * Deliberately NOT a modal. Setting your weight is a five-second job that
 * should not take over the screen, and the surrounding numbers are the context
 * you are entering it against.
 */
export function EditableStat({
  name,
  value,
  unit,
  hint,
  current,
  tone,
  onSave,
}: {
  name: string
  /** What to show when not editing — already formatted, "—" if nothing. */
  value: string
  unit: string
  hint?: string
  /** Seeds the input, so changing a number starts from the old one. */
  current?: number
  tone?: 'good'
  onSave: (value: number) => Promise<void> | void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [typed, setTyped] = useState('')
  const [saving, setSaving] = useState(false)

  const open = () => {
    setTyped(current === undefined ? '' : String(Math.round(current * 10) / 10))
    setEditing(true)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = Number(typed)
    if (!typed.trim() || !Number.isFinite(parsed) || parsed < 0) return
    setSaving(true)
    try {
      await onSave(parsed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="border-t border-hairline py-2 first:border-t-0">
        <label
          className="block pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted"
          htmlFor={`stat-${name}`}
        >
          {name}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`stat-${name}`}
            type="number"
            min={0}
            step="any"
            autoFocus
            inputMode="decimal"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="tabular ltr-nums w-24 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <span className="text-sm text-ink-muted">{unit}</span>
          <span className="flex-1" />
          <button
            type="submit"
            disabled={saving || !typed.trim()}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-surface disabled:opacity-40"
          >
            {t('entry.save')}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-hairline px-3 py-1.5 text-xs"
          >
            {t('entry.cancel')}
          </button>
        </div>
        {hint && <p className="pt-1.5 text-xs leading-relaxed text-ink-muted">{hint}</p>}
      </form>
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={t('entry.setNamed', { name })}
      className="flex w-full items-baseline justify-between gap-4 border-t border-hairline py-1.5 text-start transition-colors first:border-t-0 hover:bg-card-soft/60"
    >
      <span className="text-sm text-ink-muted">{name}</span>
      <span className="flex items-baseline gap-2">
        <span
          className={`tabular ltr-nums text-sm font-medium ${tone === 'good' ? 'text-leaf' : ''}`}
        >
          {value}
        </span>
        <span className="text-[0.68rem] text-ink-muted underline">
          {current === undefined ? t('entry.set') : t('entry.change')}
        </span>
      </span>
    </button>
  )
}
