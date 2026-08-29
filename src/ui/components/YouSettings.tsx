import {
  OBJECTIVES,
  OBJECTIVE_SHAPE,
  type Objective,
} from '@/domain'
import { Card } from './Card'
import { Stepper } from './Stepper'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

const nameKey = (o: Objective): StringKey => `objective.${o}` as StringKey
const aimKey = (o: Objective): StringKey => `objective.aim.${o}` as StringKey

/**
 * The goal and the body figures behind it.
 *
 * Moved off the dashboard on purpose. These are facts about a person, not about
 * a day: you set them once and change them rarely, and a panel of steppers at
 * the top of Today made the busiest screen shout about the parts that never
 * move. Today keeps what changes daily; this keeps what does not.
 */
export function YouSettings({
  objective,
  weightKg,
  targetKg,
  weightRecordedOn,
  onObjective,
  onWeight,
  onTarget,
}: {
  objective?: Objective
  weightKg?: number
  targetKg?: number
  /** When the current weight was last written, said plainly. */
  weightRecordedOn?: string
  onObjective: (next: Objective) => void
  onWeight: (kg: number) => void
  onTarget: (kg: number) => void
}) {
  const t = useT()
  const wantsTarget = objective ? OBJECTIVE_SHAPE[objective].wantsTarget : false

  const targetNote = () => {
    if (weightKg === undefined || targetKg === undefined) return undefined
    const gap = Math.round(Math.abs(weightKg - targetKg) * 10) / 10
    if (gap < 0.05) return t('plan.youAreThere')
    return weightKg > targetKg
      ? t('plan.toLose', { count: gap })
      : t('plan.toGain', { count: gap })
  }

  return (
    <>
      <Card label={t('settings.yourGoal')}>
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onObjective(option)}
              aria-pressed={objective === option}
              className={`rounded-full border px-4 py-2 text-[0.84rem] transition-colors ${
                objective === option
                  ? 'border-accent bg-accent text-surface'
                  : 'border-hairline bg-surface hover:bg-card-soft'
              }`}
            >
              {t(nameKey(option))}
            </button>
          ))}
        </div>
        <p className="max-w-[60ch] pt-3.5 text-[0.81rem] leading-relaxed text-ink-muted">
          {objective ? `${t(aimKey(objective))} ` : `${t('objective.chooseAim')} `}
          {t('settings.goalTail')}
        </p>
      </Card>

      <Card label={t('settings.weight')}>
        <div className="flex flex-wrap gap-x-12 gap-y-5">
          <Stepper
            label={t('settings.current')}
            value={weightKg ?? 75}
            unit="kg"
            step={0.1}
            min={30}
            max={200}
            decimals={1}
            note={
              weightRecordedOn
                  ? t('settings.lastRead', { date: weightRecordedOn })
                  : t('settings.notRecorded')
              }
            onChange={onWeight}
          />

          {/* Only programmes that are about a number on the scale ask for one. */}
          {wantsTarget && (
            <Stepper
                label={t('settings.target')}
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
        </div>
      </Card>
    </>
  )
}
