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
  // Rebuilt from a rounded integer each time, or 0.1 + 0.2 arithmetic leaves
  // a weight reading 79.30000000000001 after a few taps.
  const nudge = (by: number) =>
    onChange(clamp(Math.round((value + by) * 10 ** decimals) / 10 ** decimals))

  return (
    <div>
      <p className="pb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </p>
      <div className="flex items-center gap-2.5">
        <Nudge
          label={t('plan.less', { name: label })}
          onClick={() => nudge(-step)}
          disabled={value <= min}
          path="M5 12h14"
        />
        {/* Number and unit are both Latin, so the pair travels together and
            stays LTR even on a mirrored page. */}
        <span className="ltr-nums flex items-baseline gap-1">
          <input
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            max={max}
            aria-label={label}
            value={value.toFixed(decimals)}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (Number.isFinite(next)) onChange(clamp(next))
            }}
            className="tabular w-[4.4rem] bg-transparent text-2xl font-medium outline-none"
          />
          <span className="text-sm text-ink-muted">{unit}</span>
        </span>
        <Nudge
          label={t('plan.more', { name: label })}
          onClick={() => nudge(step)}
          disabled={value >= max}
          path="M12 5v14M5 12h14"
        />
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
