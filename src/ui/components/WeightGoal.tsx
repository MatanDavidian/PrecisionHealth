import { useState, type FormEvent } from 'react'
import { convert, directionToward, type Goal } from '@/domain'
import { useT } from '../i18n'

/**
 * The target weight, and how far off it is.
 *
 * Sits under the weight itself because that is the only place the distance
 * means anything — "75 kg" alone is a number, "78.2, 3.2 to go" is the reason
 * anyone weighs themselves.
 *
 * The DIRECTION is derived rather than asked. Nobody thinks of a target weight
 * as having one; they think "I want to be 75". Deriving it from where they are
 * today is what makes "did I get there?" answerable at all — the alternative,
 * REACH, would demand hitting the number to within a gram.
 */
export function WeightGoal({
  goal,
  currentKg,
  onSet,
}: {
  goal?: Goal
  currentKg?: number
  onSet: (targetKg: number, direction: ReturnType<typeof directionToward>) => Promise<void> | void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [typed, setTyped] = useState('')
  const [saving, setSaving] = useState(false)

  const targetKg = goal ? convert(goal.target, 'kg') : undefined
  const gap =
    targetKg !== undefined && currentKg !== undefined
      ? Math.round(Math.abs(currentKg - targetKg) * 10) / 10
      : undefined

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = Number(typed)
    if (!typed.trim() || !Number.isFinite(parsed) || parsed <= 0) return
    setSaving(true)
    try {
      // Without a current weight there is nothing to aim from, so treat the
      // target as a ceiling — the commoner intent, and correctable next time.
      await onSet(parsed, directionToward(currentKg ?? parsed + 1, parsed))
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="border-t border-hairline pt-3">
        <label
          className="block pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted"
          htmlFor="weight-goal"
        >
          {t('goal.target')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="weight-goal"
            type="number"
            min={0}
            step="any"
            autoFocus
            inputMode="decimal"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="tabular ltr-nums w-24 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <span className="text-sm text-ink-muted">kg</span>
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
        <p className="pt-1.5 text-xs leading-relaxed text-ink-muted">{t('goal.hint')}</p>
      </form>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setTyped(targetKg === undefined ? '' : String(targetKg))
        setEditing(true)
      }}
      className="flex w-full items-baseline justify-between gap-4 border-t border-hairline py-1.5 text-start transition-colors hover:bg-card-soft/60"
    >
      <span className="text-sm text-ink-muted">{t('goal.label')}</span>
      <span className="flex items-baseline gap-2">
        {targetKg === undefined ? (
          <span className="text-sm text-ink-muted">{t('goal.none')}</span>
        ) : (
          <>
            <span className="tabular ltr-nums text-sm font-medium">{targetKg} kg</span>
            {gap !== undefined && (
              <span className={`text-xs ${gap === 0 ? 'text-leaf' : 'text-ink-muted'}`}>
                {gap === 0 ? t('goal.reached') : t('goal.toGo', { count: gap })}
              </span>
            )}
          </>
        )}
        <span className="text-[0.68rem] text-ink-muted underline">
          {targetKg === undefined ? t('goal.set') : t('entry.change')}
        </span>
      </span>
    </button>
  )
}
