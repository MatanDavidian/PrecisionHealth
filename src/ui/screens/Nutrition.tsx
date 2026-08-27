import { useEffect, useState } from 'react'
import { Card } from '../components/Card'
import { MealForm } from '../components/MealForm'
import { MealEditor } from '../components/MealEditor'
import { ProvenanceBadge } from '../components/ProvenanceBadge'
import { show, showNumber } from '../format'
import { useActions, useDay } from '../useHealthData'
import { useSelectedDay, dayLabel } from '../useSelectedDay'
import { DayNav } from '../components/DayNav'
import { DataUnavailable } from '../components/DataUnavailable'
import { evaluateGoal } from '@/data/analytics'
import {
  convert,
  needsConfirmation,
  type Meal,
  type MealConflict,
  type MealEdit,
  type MealId,
} from '@/domain'
import { MealConflictNotice } from '../components/MealConflictNotice'
import { useDataRevision } from '../DataProvider'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

/** A meal just deleted, kept only long enough to offer Undo. */
interface JustDeleted {
  /** The retraction record — putting the meal back needs the version that removed it. */
  retraction: Meal
  slot: string
  kcal: number
}

export function Nutrition() {
  const t = useT()
  const selected = useSelectedDay()
  const { day, today, isToday } = selected
  const { data, error, retry } = useDay(day)
  const { addMeal, confirmEstimate, resolveMealVersion, editMeal, deleteMeal, undeleteMeal } =
    useActions()
  const { session } = useDataRevision()
  const [editing, setEditing] = useState<MealId>()
  const [deleted, setDeleted] = useState<JustDeleted>()

  /*
    Both belong to the day you were looking at. Carried onto another day, the
    Undo would restore a meal that is not on screen while claiming it came off
    "today's total", and an open editor would point at a meal from elsewhere.
  */
  useEffect(() => {
    setEditing(undefined)
    setDeleted(undefined)
  }, [day])

  if (error) return <DataUnavailable error={error} onRetry={retry} signedIn={session.authenticated} />
  if (!data) return <p className="text-sm text-ink-muted">{t('usuals.looking')}</p>

  const { nutrients, meals, goals } = data
  const proteinGoal = goals.find((g) => g.metric === 'PROTEIN')
  const progress = proteinGoal ? evaluateGoal(proteinGoal, nutrients.protein.value) : undefined

  const remove = async (meal: Meal) => {
    const retraction = await deleteMeal(meal)
    if (!retraction) return
    setEditing(undefined)
    setDeleted({ retraction, slot: t(slotKey(meal)), kcal: mealKcal(meal) })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="font-display text-4xl">{t('nutrition.title')}</h1>
          <p className="pt-1 text-sm text-ink-muted">
            {dayLabel(day, today)} · {day}
          </p>
        </div>
        <DayNav
          day={day}
          today={today}
          isToday={isToday}
          onPrevious={selected.goPrevious}
          onNext={selected.goNext}
          onToday={selected.goToday}
        />
      </header>

      <div className="grid gap-4">
        <Card label={t('nutrition.todaysTotal')}>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Total name={t('estimate.calories')} value={showNumber(nutrients.energy, 'kcal')} />
            <Total
              name={t('estimate.protein')}
              value={
                proteinGoal
                  ? `${showNumber(nutrients.protein, 'g')} / ${showNumber(proteinGoal.target, 'g')} g`
                  : show(nutrients.protein, 'g')
              }
              good={progress?.attained}
            />
            <Total name={t('estimate.carbs')} value={show(nutrients.carbs, 'g')} />
            <Total name={t('estimate.fat')} value={show(nutrients.fat, 'g')} />
          </div>
        </Card>

        {/* Logging always writes to now, so the form only makes sense on today. */}
        {isToday && (
          <Card label={t('nutrition.logAMeal')}>
            <MealForm onSubmit={addMeal} />
          </Card>
        )}

        <Card label={t('nutrition.loggedCount', { count: meals.length })}>
          {/*
            The undo sits where the meal was, and says what it cost the day's
            total. A delete you cannot take back is a trap on a phone, where
            the button is a thumb's width from the one beside it (Q7).
          */}
          {deleted && (
            <div className="my-2 flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface p-3">
              <p className="min-w-0 flex-1 text-sm text-ink-muted">
                {t('nutrition.deleted', { slot: deleted.slot, kcal: deleted.kcal })}
              </p>
              <button
                type="button"
                onClick={() => {
                  void undeleteMeal(deleted.retraction)
                  setDeleted(undefined)
                }}
                className="rounded-full border border-hairline px-4 py-1.5 text-xs font-medium transition-colors hover:bg-card-soft"
              >
                {t('usuals.undo')}
              </button>
              <button
                type="button"
                onClick={() => setDeleted(undefined)}
                className="rounded-full px-2 py-1.5 text-xs text-ink-muted"
              >
                {t('usuals.dismiss')}
              </button>
            </div>
          )}

          {meals.length === 0 && !deleted && (
            <p className="py-2 text-sm text-ink-muted">
              {t('nutrition.nothingLogged')}
            </p>
          )}

          {meals.map((meal) =>
            editing === meal.id ? (
              <MealEditor
                /*
                  Keyed on the RECORD, not the meal: if another device writes a
                  new version while this form is open, the form is rebuilt from
                  it. Dropping unsaved keystrokes is bad; saving numbers
                  computed against a version that is no longer the newest is
                  worse, because it looks like it worked.
                */
                key={meal.recordId}
                meal={meal}
                onCancel={() => setEditing(undefined)}
                onDelete={() => void remove(meal)}
                onSave={async (edit: MealEdit) => {
                  await editMeal(meal, edit)
                  setEditing(undefined)
                }}
              />
            ) : (
              <MealRow
                key={meal.id}
                meal={meal}
                onConfirm={confirmEstimate}
                conflict={data.mealConflicts.find((c) => c.mealId === meal.id)}
                onResolve={resolveMealVersion}
                onEdit={() => {
                  setDeleted(undefined)
                  setEditing(meal.id)
                }}
                onDelete={() => void remove(meal)}
              />
            ),
          )}
        </Card>
      </div>
    </div>
  )
}

const slotKey = (meal: Meal): StringKey => `common.slot.${meal.slot}` as StringKey

const mealKcal = (meal: Meal): number =>
  Math.round(meal.items.reduce((sum, item) => sum + convert(item.nutrients.energy, 'kcal'), 0))

function Total({ name, value, good }: { name: string; value: string; good?: boolean }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">{name}</p>
      <p className={`tabular ltr-nums pt-1 text-lg font-medium ${good ? 'text-leaf' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function MealRow({
  meal,
  onConfirm,
  conflict,
  onResolve,
  onEdit,
  onDelete,
}: {
  meal: Meal
  onConfirm: (meal: Meal, item: Meal['items'][number]) => Promise<void>
  conflict?: MealConflict
  onResolve: (chosen: Meal, conflict: MealConflict) => Promise<void>
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useT()
  return (
    <div className="border-t border-hairline py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{t(slotKey(meal))}</span>
        <span className="flex items-center gap-2.5">
          <span className="tabular ltr-nums text-sm">{mealKcal(meal)} kcal</span>
          <span className="flex gap-1">
            <IconButton label={t('nutrition.editMeal', { slot: t(slotKey(meal)) })} onClick={onEdit}>
              <PencilIcon />
            </IconButton>
            <IconButton
              label={t('nutrition.deleteMeal', { slot: t(slotKey(meal)) })}
              onClick={onDelete}
              tone="danger"
            >
              <TrashIcon />
            </IconButton>
          </span>
        </span>
      </div>
      {conflict && (
        <MealConflictNotice
          conflict={conflict}
          onChoose={(chosen) => void onResolve(chosen, conflict)}
        />
      )}
      {meal.items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
          <span className="text-sm text-ink-muted" dir="auto">
            {item.name} · {showNumber(item.amount, 'g')} g
            <ProvenanceBadge provenance={item.provenance} />
          </span>
          <span className="flex items-baseline gap-3">
            <span className="tabular ltr-nums text-xs text-ink-muted">
              {t('nutrition.gProtein', { grams: showNumber(item.nutrients.protein, 'g') })}
            </span>
            {needsConfirmation(item.provenance) && (
              <button
                type="button"
                onClick={() => void onConfirm(meal, item)}
                className="rounded-full bg-leaf px-3 py-1 text-xs font-medium text-surface"
              >
                {t('nutrition.confirm')}
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Small, round, and labelled for screen readers.
 *
 * Icon-only because the row is already carrying a name and a number, and a
 * third and fourth word of chrome on every meal would bury both.
 */
function IconButton({
  label,
  onClick,
  tone,
  children,
}: {
  label: string
  onClick: () => void
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-7 items-center justify-center rounded-full border border-hairline text-ink-muted transition-colors ${
        tone === 'danger'
          ? 'hover:border-accent-soft hover:bg-accent-soft hover:text-accent'
          : 'hover:bg-card-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

const iconProps = {
  width: 13,
  height: 13,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.25,
  'aria-hidden': true,
} as const

function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="m14.5 5.5 4 4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  )
}
