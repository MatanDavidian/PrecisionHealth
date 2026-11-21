import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ACTIVITY_FACTOR,
  ACTIVITY_LEVELS,
  dayProgress,
  type ActivityLevel,
  type DailyTargets,
  type Objective,
  type Sex,
  type TargetsInput,
  type TargetsResult,
} from '@/domain'
import type { TargetsReading } from '@/data/targets'
import { Card } from './Card'
import { Stepper } from './Stepper'
import { useLang } from '../i18n'
import type { StringKey } from '../i18n/strings'

/**
 * Daily targets on screen (docs/features/daily-targets.md).
 *
 * The Today card, in its two states (progress, or what is still needed), and
 * the two Settings cards: the facts the burn is estimated from, and the
 * working behind every number. The arithmetic is all in domain/targets.ts;
 * nothing here decides a number.
 */

const objectiveName = (o: Objective): StringKey => `objective.${o}` as StringKey

function useFormat() {
  const { lang } = useLang()
  return (n: number) => Math.round(n).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')
}

/** One bar. Fills from the start edge, so it runs right to left in Hebrew with no extra code. */
function Bar({
  share,
  tone,
  label,
  valueText,
  thick,
}: {
  share: number
  tone: 'accent' | 'leaf' | 'ink' | 'muted'
  label: string
  valueText: string
  thick?: boolean
}) {
  const fill = Math.max(0, Math.min(1, share))
  const colour = { accent: 'bg-accent', leaf: 'bg-leaf', ink: 'bg-ink', muted: 'bg-ink-muted/50' }[tone]
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill * 100)}
      aria-valuetext={valueText}
      className={`overflow-hidden rounded-full bg-surface ${thick ? 'h-3' : 'h-1.5'}`}
    >
      <div className={`h-full rounded-full ${colour} transition-[width] duration-500`} style={{ width: `${fill * 100}%` }} />
    </div>
  )
}

function MacroRow({
  name,
  eaten,
  target,
  reached,
  tone,
}: {
  name: string
  eaten: number
  target: number
  reached?: boolean
  tone: 'accent' | 'muted'
}) {
  const { t } = useLang()
  const fmt = useFormat()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-ink-soft">
          {name}
          {reached && (
            <span className="inline-flex items-center gap-1 rounded-full bg-leaf-soft px-2 py-0.5 text-[11px] font-semibold text-ink">
              <CheckIcon />
              {t('targets.reached')}
            </span>
          )}
        </span>
        {/* "96 / 145 g" must stay in that order on a right-to-left page. */}
        <span dir="ltr" className="tabular ltr-nums font-medium">
          {fmt(eaten)} / {fmt(target)} g
        </span>
      </div>
      <div className="pt-1.5">
        <Bar
          share={target > 0 ? eaten / target : 0}
          tone={reached ? 'leaf' : tone}
          label={name}
          valueText={t('targets.barText', { eaten: `${fmt(eaten)} g`, target: `${fmt(target)} g` })}
        />
      </div>
    </div>
  )
}

/** The sentence under the card: where the calorie target came from. */
function useWhy() {
  const { t } = useLang()
  const fmt = useFormat()
  return (targets: DailyTargets): string => {
    const goal = t(objectiveName(targets.objective))
    const burn = fmt(Math.round(targets.burn.kcal / 10) * 10)
    const head =
      targets.balanceKcal < 0
        ? t('targets.why.deficit', { goal, n: fmt(-targets.balanceKcal), burn })
        : targets.balanceKcal > 0
          ? t('targets.why.surplus', { goal, n: fmt(targets.balanceKcal), burn })
          : t('targets.why.level', { goal, burn })
    const tail =
      targets.burn.kind === 'MEASURED'
        ? t('targets.why.measured', { count: targets.burn.days })
        : t('targets.why.estimated')
    return head + tail
  }
}

export interface Eaten {
  energyKcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

/**
 * The card at the top of the day: how the day is going against its targets.
 *
 * `extra` carries what the Nutrition card used to hold (an estimated day, foods
 * waiting for a look), because this card replaces it once targets exist.
 */
export function TargetsCard({
  targets,
  eaten,
  isToday,
  dayName,
  extra,
}: {
  targets: DailyTargets
  eaten: Eaten
  isToday: boolean
  dayName: string
  extra?: ReactNode
}) {
  const { t } = useLang()
  const fmt = useFormat()
  const why = useWhy()
  const progress = dayProgress(targets, eaten)
  const energy = progress.energy

  const status =
    energy.state === 'ON_TARGET'
      ? t('targets.onTarget')
      : energy.state === 'OVER'
        ? t('targets.over', { kcal: fmt(-energy.remaining) })
        : t(isToday ? 'targets.left' : 'targets.under', { kcal: fmt(energy.remaining) })

  return (
    <section aria-labelledby="targets-title" className="rounded-card bg-card p-5" data-testid="targets-card">
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 id="targets-title" className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {isToday ? t('targets.today') : t('targets.onDay', { day: dayName })}
        </h2>
        <Link to="/settings?tab=you#daily-targets" className="text-xs text-ink-soft underline underline-offset-2">
          {t('targets.how')}
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex items-baseline gap-2">
          <span className="tabular ltr-nums font-display text-[2.6rem] leading-none">{fmt(eaten.energyKcal)}</span>
          <span className="text-sm text-ink-muted">{t('targets.of', { kcal: fmt(targets.energyKcal) })}</span>
        </p>
        <p className="flex items-center gap-1.5 text-sm font-semibold" data-testid="targets-status">
          {energy.state === 'ON_TARGET' && <CheckIcon />}
          {status}
        </p>
      </div>
      <div className="pt-3">
        <Bar
          thick
          share={energy.share}
          tone={energy.state === 'OVER' ? 'ink' : energy.state === 'ON_TARGET' ? 'leaf' : 'accent'}
          label={t('estimate.calories')}
          valueText={t('targets.barText', { eaten: `${fmt(eaten.energyKcal)} kcal`, target: `${fmt(targets.energyKcal)} kcal` })}
        />
      </div>

      <div className="grid gap-3.5 pt-5">
        <MacroRow
          name={t('estimate.protein')}
          eaten={eaten.proteinG}
          target={targets.proteinG}
          reached={progress.protein.state === 'REACHED'}
          tone="accent"
        />
        <MacroRow name={t('estimate.carbs')} eaten={eaten.carbsG} target={targets.carbsG} tone="muted" />
        <MacroRow name={t('estimate.fat')} eaten={eaten.fatG} target={targets.fatG} tone="muted" />
      </div>

      <p className="max-w-[60ch] pt-4 text-xs leading-relaxed text-ink-muted">{why(targets)}</p>
      {targets.floored && (
        <p className="max-w-[60ch] pt-1.5 text-xs leading-relaxed text-ink-muted">
          {t('targets.floored', { kcal: fmt(targets.energyKcal) })}
        </p>
      )}
      {extra}
    </section>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** What is done and what is still needed, as a checklist rather than an error. */
function Checklist({ input, result }: { input: TargetsInput; result: Extract<TargetsResult, { ok: false }> }) {
  const { t } = useLang()
  const items: { done: boolean; text: string }[] = [
    {
      done: !result.missing.includes('OBJECTIVE'),
      text: input.objective ? t('targets.missing.goalDone', { goal: t(objectiveName(input.objective)) }) : t('targets.missing.goal'),
    },
    {
      done: !result.missing.includes('WEIGHT'),
      text:
        input.weightKg !== undefined
          ? t('targets.missing.weightDone', { kg: (Math.round(input.weightKg * 10) / 10).toString() })
          : t('targets.missing.weight'),
    },
    {
      done: !result.missing.includes('BURN'),
      text: result.missing.includes('BURN') ? t('targets.missing.burn') : t('targets.missing.burnDone'),
    },
  ]
  return (
    <ul className="grid gap-2.5 pt-3">
      {items.map((item) => (
        <li key={item.text} className="flex items-start gap-2.5 text-sm">
          <span
            className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${
              item.done ? 'bg-leaf text-surface' : 'border-[1.5px] border-ink-muted'
            }`}
          >
            {item.done && <CheckIcon />}
            <span className="sr-only">{item.done ? t('targets.done') : t('targets.todo')}</span>
          </span>
          <span className={item.done ? 'text-ink-soft' : 'font-medium'}>{item.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** Today, before the targets can be worked out: what is still needed, and where to give it. */
export function TargetsSetupCard({ reading }: { reading: TargetsReading }) {
  const { t } = useLang()
  if (reading.result.ok) return null
  return (
    <section aria-labelledby="targets-setup-title" className="rounded-card border border-dashed border-hairline p-5" data-testid="targets-setup">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">{t('targets.setup')}</p>
      <h2 id="targets-setup-title" className="pt-2 font-display text-xl leading-snug">
        {t('targets.missing.title')}
      </h2>
      <Checklist input={reading.input} result={reading.result} />
      <Link
        to="/settings?tab=you#about-you"
        className="mt-4 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-surface"
      >
        {t('targets.missing.setUp')}
      </Link>
    </section>
  )
}

/** Brings a Settings card into view when a link points at it ("How?", "Set them up"). */
function useScrollIntoViewOnHash(id: string, ready: boolean) {
  useEffect(() => {
    if (!ready || window.location.hash !== `#${id}`) return
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [id, ready])
}

/** Settings: the four numbers and every step of how they were reached. */
export function TargetsWorking({ reading }: { reading: TargetsReading }) {
  const { t } = useLang()
  const fmt = useFormat()
  useScrollIntoViewOnHash('daily-targets', true)
  const { result } = reading

  return (
    <div id="daily-targets" className="scroll-mt-4">
      <Card label={t('settings.targets')}>
        {result.ok ? (
          <TargetsWorkingBody targets={result.targets} currentKg={reading.input.weightKg} fmt={fmt} />
        ) : (
          <>
            <p className="text-sm font-medium">{t('targets.missing.title')}</p>
            <Checklist input={reading.input} result={result} />
          </>
        )}
      </Card>
    </div>
  )
}

function TargetsWorkingBody({
  targets,
  currentKg,
  fmt,
}: {
  targets: DailyTargets
  currentKg?: number
  fmt: (n: number) => string
}) {
  const { t } = useLang()
  const goal = t(objectiveName(targets.objective))
  const target = fmt(targets.energyKcal)
  const burn = targets.burn
  const tiles: { value: string; unit: string; name: string }[] = [
    { value: fmt(targets.energyKcal), unit: 'kcal', name: t('estimate.calories') },
    { value: fmt(targets.proteinG), unit: 'g', name: t('estimate.protein') },
    { value: fmt(targets.carbsG), unit: 'g', name: t('estimate.carbs') },
    { value: fmt(targets.fatG), unit: 'g', name: t('estimate.fat') },
  ]
  const lines = [
    burn.kind === 'MEASURED'
      ? t('targets.work.measured', { kcal: fmt(Math.round(burn.kcal / 10) * 10), count: burn.days })
      : t('targets.work.estimated', {
          kcal: fmt(Math.round(burn.kcal / 10) * 10),
          resting: fmt(burn.restingKcal),
          factor: ACTIVITY_FACTOR[burn.activity].toString(),
          activity: t(`settings.activity.${burn.activity}` as StringKey),
        }),
    targets.objective === 'FITNESS'
      ? t('targets.work.fitness', { target })
      : targets.balanceKcal < 0
        ? t('targets.work.deficit', { goal, n: fmt(-targets.balanceKcal), target })
        : targets.balanceKcal > 0
          ? t('targets.work.surplus', { goal, n: fmt(targets.balanceKcal), target })
          : t('targets.work.level', { goal, target }),
    ...(targets.floored ? [t('targets.floored', { kcal: target })] : []),
    targets.protein.from === 'GOAL'
      ? t('targets.work.proteinGoal', { g: fmt(targets.proteinG) })
      : t(
          // Said differently when the target weight, not today's, was the one multiplied.
          currentKg !== undefined && targets.protein.weightKg < currentKg
            ? 'targets.work.proteinRuleTarget'
            : 'targets.work.proteinRule',
          { perKg: targets.protein.perKg.toString(), kg: (Math.round(targets.protein.weightKg * 10) / 10).toString() },
        ),
    t('targets.work.split'),
  ]
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" data-testid="targets-tiles">
        {tiles.map((tile) => (
          <div key={tile.name}>
            <p className="text-xs text-ink-muted">{tile.name}</p>
            <p dir="ltr" className="tabular ltr-nums text-start text-2xl font-medium rtl:text-end">
              {tile.value} <span className="text-sm font-normal text-ink-muted">{tile.unit}</span>
            </p>
          </div>
        ))}
      </div>
      <ul className="grid list-disc gap-1.5 ps-5 pt-4 text-[0.81rem] leading-relaxed text-ink-soft marker:text-ink-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="pt-3 text-xs text-ink-muted">{t('targets.work.disclaimer')}</p>
    </>
  )
}

const SEXES: Sex[] = ['FEMALE', 'MALE', 'UNDISCLOSED']

/** Settings: the facts the burn is estimated from when no watch reports one. */
export function AboutYou({
  reading,
  thisYear,
  onSave,
}: {
  reading: TargetsReading
  thisYear: number
  onSave: (patch: { height?: { value: number; unit: 'cm' }; birthYear?: number; sex?: Sex; activity?: ActivityLevel }) => void
}) {
  const { t } = useLang()
  useScrollIntoViewOnHash('about-you', true)
  const profile = reading.profile
  const heightCm = reading.input.heightCm
  const birthYear = profile?.birthYear

  const pill = (on: boolean) =>
    `rounded-full border px-[15px] py-[7px] text-[13.5px] transition-colors ${
      on ? 'border-ink bg-ink font-medium text-canvas' : 'border-hairline bg-surface hover:bg-card-soft'
    }`

  return (
    <div id="about-you" className="scroll-mt-4">
      <Card label={t('settings.aboutYou')}>
        <div className="flex flex-wrap gap-x-12 gap-y-5">
          <Stepper
            label={t('settings.height')}
            value={heightCm !== undefined ? Math.round(heightCm) : 170}
            unit="cm"
            step={1}
            min={120}
            max={230}
            note={heightCm === undefined ? t('settings.notSetYet') : undefined}
            saved={heightCm !== undefined}
            onChange={(cm) => onSave({ height: { value: cm, unit: 'cm' } })}
          />
          <Stepper
            label={t('settings.birthYear')}
            value={birthYear ?? 1990}
            unit=""
            step={1}
            min={thisYear - 100}
            max={thisYear - 13}
            note={birthYear === undefined ? t('settings.notSetYet') : t('settings.age', { age: thisYear - birthYear })}
            saved={birthYear !== undefined}
            onChange={(year) => onSave({ birthYear: year })}
          />
        </div>

        <fieldset className="m-0 mt-6 min-w-0 border-0 p-0">
          <legend className="pb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {t('settings.sex')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {SEXES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={profile?.sex === option}
                onClick={() => onSave({ sex: option })}
                className={pill(profile?.sex === option)}
              >
                {t(`settings.sex.${option}` as StringKey)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 mt-6 min-w-0 border-0 p-0">
          <legend className="pb-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {t('settings.activity')}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ACTIVITY_LEVELS.map((level) => {
              const on = profile?.activity === level
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSave({ activity: level })}
                  className={`rounded-2xl border px-3.5 py-2.5 text-start transition-colors ${
                    on ? 'border-ink bg-ink text-canvas' : 'border-hairline bg-surface hover:bg-card-soft'
                  }`}
                >
                  <span className="block text-sm font-semibold">{t(`settings.activity.${level}` as StringKey)}</span>
                  <span className="block pt-0.5 text-xs">{t(`settings.activity.${level}.detail` as StringKey)}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <p className="max-w-[60ch] pt-4 text-[0.81rem] leading-relaxed text-ink-muted">{t('settings.aboutYouNote')}</p>
      </Card>
    </div>
  )
}
