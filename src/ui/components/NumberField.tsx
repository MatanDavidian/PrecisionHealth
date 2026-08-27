/**
 * A labelled number input for grams and macros.
 *
 * Shared by the two places a person corrects food numbers — an estimate on the
 * Log screen before it is saved, and a meal in Nutrition after it is. They are
 * the same act at different moments, so they look and behave identically
 * rather than being two near-copies that drift.
 *
 * Zero renders as an empty box with a "0" placeholder: a field reading 0 looks
 * like an answer, and an empty one looks like a question.
 */
export const fieldClass =
  'w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-accent'
export const labelClass =
  'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'

export function NumberField({
  id,
  label,
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
  /** Marks a number that moved on its own, because the weight changed. */
  highlight?: boolean
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step="any"
        disabled={disabled}
        className={`${fieldClass} tabular ${highlight ? 'border-accent' : ''}`}
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  )
}
