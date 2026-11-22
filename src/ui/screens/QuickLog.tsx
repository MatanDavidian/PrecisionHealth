import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { readUsuals } from '@/data/usuals'
import { currentUserId } from '@/data/session'
import { suggestSlot } from '@/data/newRecords'
import { convert, liveItems, MEAL_SLOTS, type Meal, type MealSlot, type UsualMeal } from '@/domain'
import { useActions } from '../useHealthData'
import { useDataRevision } from '../DataProvider'
import { useLang } from '../i18n'
import type { StringKey } from '../i18n/strings'

/**
 * The quick sheet (docs/features/meal-reminders.md): where a meal reminder
 * leads. Your usual meals for that time, one tap each; or write it, or take
 * a photo.
 *
 * Opened from a notification's meal button, the address carries the meal
 * (`log`, its signature) and a one-time mark (`once`, the day and the slot):
 * the meal is logged at once, and a second tap of the same button, or a
 * reload, shows the confirmation again without logging it twice.
 */

const isSlot = (value: string | null): value is MealSlot => !!value && (MEAL_SLOTS as string[]).includes(value)

const ONCE_KEY = 'vimetry-quick-once'
const usedMarks = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(ONCE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}
const rememberMark = (mark: string) => {
  try {
    // The last thirty are plenty: a mark is one reminder, one day.
    localStorage.setItem(ONCE_KEY, JSON.stringify([...usedMarks().filter((m) => m !== mark), mark].slice(-30)))
  } catch {
    // Private browsing: the in-sheet check below still stops a second log while the page is open.
  }
}

const mealName = (usual: UsualMeal) => liveItems(usual.template.items).map((item) => item.name).join(', ')
const mealKcal = (usual: UsualMeal) =>
  Math.round(liveItems(usual.template.items).reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0))

type Logged = { usual: UsualMeal; meal?: Meal; again?: boolean; undone?: boolean }

export function QuickLog() {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { revision } = useDataRevision()
  const { logRepeat, deleteMeal } = useActions()
  const slot: MealSlot = isSlot(params.get('slot')) ? (params.get('slot') as MealSlot) : suggestSlot(new Date())
  const [usuals, setUsuals] = useState<UsualMeal[]>()
  const [logged, setLogged] = useState<Logged>()
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const handled = useRef(false)
  const fmt = (n: number) => n.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')

  useEffect(() => {
    let cancelled = false
    void readUsuals(currentUserId(), slot)
      .then((found) => {
        if (!cancelled) setUsuals(found.forThisSlot)
      })
      .catch(() => {
        if (!cancelled) setUsuals([])
      })
    return () => {
      cancelled = true
    }
  }, [slot, revision])

  async function log(usual: UsualMeal) {
    setBusy(true)
    const meal = await logRepeat(usual, slot)
    setBusy(false)
    if (meal) setLogged({ usual, meal })
  }

  // From a notification's meal button: log it now, once.
  useEffect(() => {
    if (!usuals || handled.current) return
    const key = params.get('log')
    const mark = params.get('once')
    if (!key) return
    handled.current = true
    const usual = usuals.find((u) => u.signature === key)
    const clean = new URLSearchParams(params)
    clean.delete('log')
    clean.delete('once')
    setParams(clean, { replace: true })
    if (!usual) {
      setStale(true)
      return
    }
    if (mark && usedMarks().includes(mark)) {
      setLogged({ usual, again: true })
      return
    }
    if (mark) rememberMark(mark)
    void log(usual)
    // Runs once per opening, when the usual meals arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuals])

  const slotName = t(`common.slot.${slot}` as StringKey)

  return (
    <div className="mx-auto max-w-md">
      <header className="pb-5">
        <h1 className="font-display text-4xl">{slotName}</h1>
        <p className="pt-1 text-sm text-ink-muted">{t('quick.subtitle')}</p>
      </header>

      {logged && (
        <section role="status" aria-live="polite" className="mb-5 rounded-card bg-leaf-soft p-5" data-testid="quick-logged">
          <p className="text-sm font-semibold">
            {logged.undone
              ? t('quick.undone')
              : t('quick.logged', { name: mealName(logged.usual), kcal: fmt(mealKcal(logged.usual)) })}
          </p>
          {logged.again && !logged.undone && <p className="pt-1 text-xs text-ink-soft">{t('quick.already')}</p>}
          <div className="flex flex-wrap gap-3 pt-4">
            {logged.meal && !logged.undone && (
              <button
                type="button"
                onClick={() =>
                  void deleteMeal(logged.meal!).then((ok) => ok && setLogged({ ...logged, undone: true }))
                }
                className="rounded-full border border-ink px-4 py-2 text-sm font-medium"
              >
                {t('quick.undo')}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/today')}
              className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-canvas"
            >
              {t('quick.done')}
            </button>
          </div>
        </section>
      )}

      {stale && <p className="mb-4 text-sm text-ink-soft">{t('quick.stale')}</p>}

      {usuals === undefined ? (
        <p className="text-sm text-ink-muted">{t('usuals.looking')}</p>
      ) : usuals.length === 0 ? (
        <p className="mb-4 text-sm text-ink-soft">{t('quick.none', { slot: slotName })}</p>
      ) : (
        <ul className="grid gap-3" aria-label={t('quick.usualsLabel', { slot: slotName })}>
          {usuals.map((usual) => (
            <li key={usual.signature}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void log(usual)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-hairline bg-surface px-4 py-4 text-start transition-colors hover:bg-card-soft disabled:opacity-50"
              >
                <span className="text-[15px] font-medium leading-snug">{mealName(usual)}</span>
                <span dir="ltr" className="tabular ltr-nums shrink-0 text-sm text-ink-muted">
                  {fmt(mealKcal(usual))} kcal
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-3 pt-6">
        <Link to="/log?mode=write" className="rounded-full border border-hairline bg-surface px-5 py-2.5 text-sm font-medium">
          {t('quick.write')}
        </Link>
        <Link to="/log" className="rounded-full border border-hairline bg-surface px-5 py-2.5 text-sm font-medium">
          {t('quick.photo')}
        </Link>
      </div>
    </div>
  )
}
