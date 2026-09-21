import { useT } from '../i18n'

/**
 * What just happened, and how to take it back.
 *
 * Separate from the Gaps card because it replaces it: once the days are
 * filled there are no gaps left to offer, and leaving the offer on screen
 * beside its own result is how an interface makes people doubt whether the
 * button worked.
 *
 * Undo is the only action here. Correcting a filled day happens on the day
 * itself, meal by meal, exactly as it would for anything else — a second
 * "correct" affordance in a confirmation strip would be a second path to the
 * same screen.
 */
export function FilledNotice({ days, onUndo }: { days: number; onUndo: () => void }) {
  const t = useT()
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface px-5 py-3.5">
      <p className="text-sm">
        {days === 1 ? t('gaps.filledOne') : t('gaps.filledMany', { count: days })}
      </p>
      <button
        type="button"
        onClick={onUndo}
        className="rounded-full border border-hairline px-4 py-1.5 text-sm transition-colors hover:bg-card-soft"
      >
        {t('gaps.undo')}
      </button>
    </section>
  )
}
