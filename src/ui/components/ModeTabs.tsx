/**
 * The three ways into a meal, as one control.
 *
 * A second row of tabs under the app's own navigation is usually a smell — it
 * means a screen is doing several jobs. Here it is the point: photograph,
 * describe and repeat are the same job with different evidence, and putting
 * them side by side is what lets each panel hold ONE input and nothing else.
 * The alternative, which this replaces, was a single screen stacking a repeat
 * list above a camera above a details form, where the thing you wanted was
 * always below the fold.
 */
import { PILL, PILL_OFF, PILL_ON } from './segmented'

export interface ModeTab<T extends string> {
  value: T
  label: string
  /** Announced to screen readers; the label alone is too terse out of context. */
  description: string
}

/** Stable ids, so a panel can point back at the tab that opened it. */
export const modeTabId = (value: string): string => `log-mode-${value}`

export function ModeTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly ModeTab<T>[]
  value: T
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mb-[18px] flex gap-1 rounded-full bg-card p-1"
    >
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            id={modeTabId(tab.value)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={tab.description}
            onClick={() => onChange(tab.value)}
            className={`flex-1 py-[9px] text-center ${PILL} ${active ? PILL_ON : PILL_OFF}`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
