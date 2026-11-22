import { useId } from 'react'
import {
  FOCUSES,
  leadObjective,
  WEIGHT_AIMS,
  wantsTargetWeight,
  type Focus,
  type GoalChoice,
  type Objective,
  type WeightAim,
} from '@/domain'
import { Card } from './Card'
import { Stepper } from './Stepper'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

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
  choice,
  weightKg,
  targetKg,
  weightRecordedOn,
  onChoice,
  onWeight,
  onTarget,
}: {
  /** What the person is working towards, as two answers (several-goals.md). */
  choice?: GoalChoice
  weightKg?: number
  targetKg?: number
  /** When the current weight was last written, said plainly. */
  weightRecordedOn?: string
  onChoice: (next: GoalChoice) => void
  onWeight: (kg: number) => void
  onTarget: (kg: number) => void
}) {
  const t = useT()
  const wantsTarget = wantsTargetWeight(choice)
  const weightLabel = useId()
  const alsoLabel = useId()
  const pill = (on: boolean) =>
    `rounded-full border px-[15px] py-[7px] text-[13.5px] transition-colors ${
      on ? 'border-ink bg-ink font-medium text-canvas' : 'border-hairline bg-surface hover:bg-card-soft'
    }`
  const setAim = (aim: WeightAim) => onChoice({ aim, focus: choice?.focus ?? [] })
  // Something else chosen before the weight question: no weight goal, until one is picked.
  const toggleFocus = (focus: Focus) => {
    const now = choice?.focus ?? []
    onChoice({ aim: choice?.aim ?? 'NONE', focus: now.includes(focus) ? now.filter((f) => f !== focus) : [...now, focus] })
  }
  /** What the combination means, in one or two sentences. */
  const meaning = (): string => {
    if (!choice) return t('objective.chooseAim')
    const lead: Objective = leadObjective(choice)
    const extra =
      choice.aim === 'LOSE' && (choice.focus.includes('MUSCLE') || choice.focus.includes('FAT'))
        ? t('goal.loseKeepMuscle')
        : choice.aim === 'KEEP' && choice.focus.includes('FAT')
          ? t('goal.recomposition')
          : choice.aim === 'KEEP' && choice.focus.includes('MUSCLE')
            ? t('goal.keepBuild')
            : choice.aim === 'GAIN' && choice.focus.includes('FAT')
              ? t('goal.leanGain')
              : ''
    return `${t(aimKey(lead))}${extra ? ` ${extra}` : ''}`
  }

  /*
    The note also carries whether a target EXISTS.

    The stepper falls back to the current weight rounded, so an unset target
    showed as a confident "73.0 kg" that was never saved — the screen claiming
    a goal nobody had chosen. The number is still a sensible place to start
    from; it just has to stop pretending.
  */
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
        <p id={weightLabel} className="pb-2.5 text-sm font-medium">
          {t('goal.weightTitle')}
        </p>
        <div role="radiogroup" aria-labelledby={weightLabel} className="flex flex-wrap gap-2">
          {WEIGHT_AIMS.map((aim) => (
            <button
              key={aim}
              type="button"
              role="radio"
              aria-checked={choice?.aim === aim}
              onClick={() => setAim(aim)}
              /* Selected is ink, not accent: orange-capable pills would leave
                 the screen with no way left to say "this is the button". */
              className={pill(choice?.aim === aim)}
            >
              {t(`goal.aim.${aim}` as StringKey)}
            </button>
          ))}
        </div>

        <p id={alsoLabel} className="pb-2.5 pt-5 text-sm font-medium">
          {t('goal.alsoTitle')} <span className="font-normal text-ink-muted">· {t('goal.alsoOptional')}</span>
        </p>
        <div role="group" aria-labelledby={alsoLabel} className="flex flex-wrap gap-2">
          {FOCUSES.map((focus) => (
            <button
              key={focus}
              type="button"
              aria-pressed={choice?.focus.includes(focus) ?? false}
              onClick={() => toggleFocus(focus)}
              className={pill(choice?.focus.includes(focus) ?? false)}
            >
              {t(`goal.focus.${focus}` as StringKey)}
            </button>
          ))}
        </div>

        <p className="max-w-[60ch] pt-3.5 text-[0.81rem] leading-relaxed text-ink-muted" data-testid="goal-meaning">
          {meaning()} {t('settings.goalTail')}
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
            saved={weightKg !== undefined}
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
              note={targetNote() ?? t('settings.targetNotSet')}
              saved={targetKg !== undefined}
              onChange={onTarget}
            />
          )}
        </div>
      </Card>
    </>
  )
}
