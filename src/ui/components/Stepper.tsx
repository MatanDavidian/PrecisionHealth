import { useState } from 'react'
import { useT } from '../i18n'

/**
 * A number you nudge rather than type.
 *
 * These three figures — weight, target, calories burned — move by small known
 * amounts from where they already are. Weight goes from 79.4 to 79.3, not to
 * some unrelated number, so a keyboard is the wrong instrument: it demands you
 * retype four characters to change one of them.
 *
 * The value is still an input, so typing 82 straight in works. Nudging is the
 * common case; typing is the escape hatch, not the other way round.
 */
export function Stepper({
  label,
  value,
  unit,
  step,
  min,
  max,
  decimals = 0,
  note,
  onChange,
}: {
  label: string
  value: number
  unit: string
  step: number
  min: number
  max: number
  decimals?: number
  note?: string
  onChange: (next: number) => void
}) {
  const t = useT()
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  /**
   * What is on screen while you are still deciding.
   *
   * `undefined` means "showing the saved value". Anything else is a draft that
   * has not been committed yet, and that distinction is the whole fix.
   *
   * Every change used to be written the instant it happened, which broke this
   * control in two separate ways. Typing 73 into a field showing 75.0 sent the
   * first keystroke — `7` — straight through `clamp`, so it was saved as the
   * 30 kg minimum and the field jumped under the cursor. And because weight is
   * append-only (D4), nudging from 75 to 73 wrote TWENTY observations, all of
   * which then showed up on Today as competing readings for the same morning.
   *
   * One weigh-in is one number. It is recorded when you say so.
   */
  const [draft, setDraft] = useState<string>()
  const shown = draft ?? value.toFixed(decimals)
  const parsed = Number(shown)
  const dirty = draft !== undefined && Number.isFinite(parsed) && clamp(parsed) !== value

  const commit = () => {
    if (draft === undefined) return
    const next = Number(draft)
    // An unreadable draft reverts rather than saving something invented.
    setDraft(undefined)
    if (!Number.isFinite(next)) return
    const rounded = Math.round(clamp(next) * 10 ** decimals) / 10 ** decimals
    if (rounded !== value) onChange(rounded)
  }

  // Rebuilt from a rounded number each time, or 0.1 + 0.2 arithmetic leaves
  // a weight reading 79.30000000000001 after a few taps.
  const nudge = (by: number) => {
    const from = Number.isFinite(parsed) ? parsed : value
    const next = Math.round(clamp(from + by) * 10 ** decimals) / 10 ** decimals
    setDraft(next.toFixed(decimals))
  }

  return (
    <div>
      <p className="pb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </p>
      <div className="flex items-center gap-2.5">
        <Nudge
          label={t('plan.less', { name: label })}
          onClick={() => nudge(-step)}
          disabled={parsed <= min}
          path="M5 12h14"
        />
        {/* Number and unit are both Latin, so the pair travels together and
            stays LTR even on a mirrored page. */}
        <span className="ltr-nums flex items-baseline gap-1">
          <input
            /*
              A text field that reports itself as a spinbutton.

              `type="number"` cannot hold a draft: a partially typed value is
              not a number, so the browser hands back an empty string and the
              half-typed entry vanishes. Text keeps what was typed; `inputMode`
              still raises the numeric keypad; and the ARIA role and values say
              what this actually is, which is what a screen reader needs and
              what `type="text"` alone would have thrown away.
            */
            type="text"
            inputMode="decimal"
            role="spinbutton"
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-label={label}
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            /* Committing on blur as well as on the button means an edit is
               never silently lost by tapping elsewhere. */
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
              if (e.key === 'Escape') setDraft(undefined)
            }}
            className="tabular w-[4.4rem] bg-transparent text-2xl font-medium outline-none"
          />
          <span className="text-sm text-ink-muted">{unit}</span>
        </span>
        <Nudge
          label={t('plan.more', { name: label })}
          onClick={() => nudge(step)}
          disabled={parsed >= max}
          path="M12 5v14M5 12h14"
        />
        {/*
          Always rendered, invisible until there is something to save.

          A button that appears would shift the row it sits in, and a control
          that moves when you use it is the one thing this app has already been
          told off for twice.
        */}
        <button
          type="button"
          onClick={commit}
          aria-hidden={!dirty}
          tabIndex={dirty ? 0 : -1}
          className={`rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-canvas transition-opacity ${
            dirty ? '' : 'pointer-events-none opacity-0'
          }`}
        >
          {t('plan.save')}
        </button>
      </div>
      {note && <p className="pt-2 text-xs text-ink-muted">{note}</p>}
    </div>
  )
}

function Nudge({
  label,
  onClick,
  disabled,
  path,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  path: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-ink-muted transition-colors hover:bg-card-soft disabled:opacity-30"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        aria-hidden
      >
        <path d={path} />
      </svg>
    </button>
  )
}
