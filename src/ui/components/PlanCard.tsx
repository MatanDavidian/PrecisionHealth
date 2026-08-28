import { useState } from 'react'
import {
  OBJECTIVES,
  OBJECTIVE_SHAPE,
  balanceOf,
  convert,
  type Objective,
} from '@/domain'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { Stepper } from './Stepper'

const objectiveKey = (o: Objective): StringKey => `objective.${o}` as StringKey
const aimKey = (o: Objective): StringKey => `objective.aim.${o}` as StringKey

/**
 * The four numbers that actually drive the app, in one place.
 *
 * Weight, target, what you burned and what you are working towards. They were
 * scattered across three cards, each read-only, which made the dashboard a
 * report rather than something you use — and left the one question a person
 * opens this app to ask ("am I ahead or behind today?") unanswered anywhere.
 *
 * The balance strip at the bottom is that answer, and it is the reason the
 * other three are gathered here: it cannot be computed without all of them.
 */
export function PlanCard({
  weightKg,
  targetKg,
  burnedKcal,
  eatenKcal,
  objective,
  onWeight,
  onTarget,
  onBurned,
  onObjective,
  /** Set when the burned figure came from the user rather than a device. */
  burnedByHand,
}: {
  weightKg?: number
  targetKg?: number
  burnedKcal?: number
  eatenKcal: number
  objective?: Objective
  onWeight: (kg: number) => void
  onTarget: (kg: number) => void
  onBurned: (kcal: number) => void
  onObjective: (next: Objective) => void
  burnedByHand?: boolean
}) {
  const t = useT()
  const [picking, setPicking] = useState(false)

  const wantsTarget = objective ? OBJECTIVE_SHAPE[objective].wantsTarget : false
  const balance = balanceOf(eatenKcal, burnedKcal ?? 0)
  const net = Math.round(balance.netKcal)

  /** How far from the target, said the way a person would say it. */
  const targetNote = (): string | undefined => {
    if (weightKg === undefined || targetKg === undefined) return undefined
    const gap = Math.round(Math.abs(weightKg - targetKg) * 10) / 10
    if (gap < 0.05) return t('plan.youAreThere')
    return weightKg > targetKg
      ? t('plan.toLose', { count: gap })
      : t('plan.toGain', { count: gap })
  }

  return (
    <section className="mb-4 rounded-card bg-card p-5">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stepper
          label={t('plan.currentWeight')}
          value={weightKg ?? 75}
          unit="kg"
          step={0.1}
          min={30}
          max={200}
          decimals={1}
          onChange={onWeight}
        />

        {/* Only programmes that are about a number on the scale ask for one. */}
        {wantsTarget && (
          <Stepper
            label={t('plan.targetWeight')}
            value={targetKg ?? Math.round(weightKg ?? 75)}
            unit="kg"
            step={0.5}
            min={30}
            max={200}
            decimals={1}
            note={targetNote()}
            onChange={onTarget}
          />
        )}

        <Stepper
          label={t('plan.burnedPerDay')}
          value={burnedKcal ?? 2000}
          unit="kcal"
          step={50}
          min={800}
          max={6000}
          note={burnedByHand ? t('plan.byHand') : undefined}
          onChange={onBurned}
        />

        <div>
          <p className="pb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {t('plan.goal')}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[1.05rem] font-medium">
              {objective ? t(objectiveKey(objective)) : t('objective.none')}
            </span>
            <button
              type="button"
              onClick={() => setPicking((open) => !open)}
              className="text-[0.81rem] text-accent underline"
            >
              {picking ? t('plan.done') : t('plan.change')}
            </button>
          </div>
          <p className="pt-2 text-xs leading-relaxed text-ink-muted">
            {objective ? t(aimKey(objective)) : t('objective.chooseAim')}
          </p>
        </div>
      </div>

      {picking && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
          {OBJECTIVES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onObjective(option)
                setPicking(false)
              }}
              aria-pressed={objective === option}
              className={`rounded-full border px-4 py-2 text-[0.84rem] transition-colors ${
                objective === option
                  ? 'border-accent bg-accent text-surface'
                  : 'border-hairline bg-surface hover:bg-card-soft'
              }`}
            >
              {t(objectiveKey(option))}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-3.5">
        <span className="text-sm text-ink-muted">
          {t('plan.ateBurned', {
            eaten: Math.round(eatenKcal).toLocaleString(),
            burned: Math.round(burnedKcal ?? 0).toLocaleString(),
          })}
        </span>
        <span
          className={`tabular ltr-nums rounded-full px-3 py-1 text-xs font-medium ${
            net === 0
              ? 'bg-card-soft text-ink-muted'
              : net > 0
                ? 'bg-accent-soft text-accent'
                : 'bg-leaf-soft text-leaf'
          }`}
        >
          {net === 0
            ? t('plan.level')
            : net > 0
              ? t('plan.over', { count: Math.abs(net).toLocaleString() })
              : t('plan.under', { count: Math.abs(net).toLocaleString() })}
        </span>
      </div>
    </section>
  )
}

/** Reads a weight out of an observation, in kg, for the card above. */
export const kgOf = (value?: { value: number; unit: string }): number | undefined =>
  value ? convert(value as Parameters<typeof convert>[0], 'kg') : undefined
