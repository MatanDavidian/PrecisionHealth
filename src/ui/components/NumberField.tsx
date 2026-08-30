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
  trailing,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  /** Marks a number that moved on its own, because the weight changed. */
  highlight?: boolean
  /**
   * A control sitting against the field, sharing its height.
   *
   * Refill lives here rather than under the grid because it acts on this one
   * number: a button that changes the grams belongs beside the grams, where
   * you can see what it did without looking for it.
   */
  trailing?: React.ReactNode
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <div className="flex items-stretch gap-1.5">
        <input
          id={id}
          type="number"
          min={0}
          step="any"
          disabled={disabled}
          /*
            The border colour is SWAPPED, not appended. `fieldClass` already
            carries `border-hairline`, and two utilities setting the same
            property resolve by their order in the generated stylesheet rather
            than in this string — so appending `border-accent` quietly lost,
            and the mark on a number that moved on its own has never actually
            shown. Replacing the token leaves nothing to resolve.
          */
          className={`${fieldClass.replace(
            'border-hairline',
            highlight ? 'border-accent' : 'border-hairline',
          )} tabular min-w-0 flex-1`}
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        {trailing}
      </div>
    </div>
  )
}
