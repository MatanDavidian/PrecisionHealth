import { MAX_DESCRIPTION_CHARS } from '../../../../supabase/functions/_shared/prompt'

/**
 * Logging a meal by describing it.
 *
 * The gap the other two modes leave: the meal you eat often but have never
 * photographed, and the one you already ate an hour ago. Cheaper and faster
 * than a photo — a couple of seconds against up to a minute — and honestly
 * less accurate, which the estimate says out loud rather than hiding behind
 * the same confident-looking numbers.
 */
export function WritePanel({
  value,
  onChange,
  onEstimate,
  recent,
  onForgetRecent,
  busy,
}: {
  value: string
  onChange: (next: string) => void
  onEstimate: () => void
  /** Descriptions typed before on this device, ready to send again. */
  recent: string[]
  onForgetRecent: (description: string) => void
  busy: boolean
}) {
  const text = value.trim()
  const tooLong = value.length > MAX_DESCRIPTION_CHARS

  return (
    <div>
      <label className="sr-only" htmlFor="meal-description">
        What did you eat?
      </label>
      <textarea
        id="meal-description"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="two eggs on toast and a black coffee"
        className="w-full rounded-card border border-hairline bg-surface px-4 py-3 text-sm leading-relaxed outline-none focus:border-accent"
      />

      <div className="flex flex-wrap items-center gap-3 pt-3">
        <button
          type="button"
          onClick={onEstimate}
          disabled={!text || tooLong || busy}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface transition-colors disabled:opacity-40"
        >
          Estimate
        </button>
        <span className="text-xs text-ink-muted">
          {tooLong
            ? `That is longer than ${MAX_DESCRIPTION_CHARS} characters — trim it to the food itself.`
            : 'A couple of seconds, and a wider margin than a photo.'}
        </span>
      </div>

      {recent.length > 0 && (
        <div className="pt-6">
          <div className="flex flex-wrap gap-2">
            {recent.map((description) => (
              <span
                key={description}
                className="flex items-center gap-1 rounded-full border border-hairline bg-surface pl-3 pr-1 text-sm"
              >
                <button
                  type="button"
                  onClick={() => onChange(description)}
                  className="max-w-[16rem] truncate py-1.5 text-left"
                >
                  {description}
                </button>
                <button
                  type="button"
                  aria-label={`Forget "${description}"`}
                  onClick={() => onForgetRecent(description)}
                  className="flex size-5 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-card-soft"
                >
                  <CrossIcon />
                </button>
              </span>
            ))}
          </div>
          <p className="pt-2 text-xs text-ink-muted">
            Things you've described before, ready to send again. Kept on this device only.
          </p>
        </div>
      )}
    </div>
  )
}

function CrossIcon() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  )
}
