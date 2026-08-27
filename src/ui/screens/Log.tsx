import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { estimatorRequiresKey, getRepositories } from '@/data'
import type { EstimateHints } from '@/ai/estimator'
import { buildEstimatedMeal, type EstimateCorrection } from '@/data/estimatedMeal'
import { deviceZone, suggestSlot } from '@/data/newRecords'
import {
  forgetDescription,
  readRecentDescriptions,
  rememberDescription,
} from '@/data/descriptions'
import { useDataRevision } from '../DataProvider'
import { useAnalysis, useElapsed } from '../AnalysisProvider'
import { useActions } from '../useHealthData'
import { OneTimeNotice, hasSeenNotice, markNoticeSeen } from '../components/OneTimeNotice'
import { UsualsPanel } from '../components/UsualsPanel'
import { ModeTabs, modeTabId, type ModeTab } from '../components/ModeTabs'
import { PhotoPanel } from '../components/log/PhotoPanel'
import { WritePanel } from '../components/log/WritePanel'
import { InputPreview } from '../components/log/InputPreview'
import { EstimateCard } from '../components/log/EstimateCard'
import { readUsuals, type Usuals } from '@/data/usuals'
import { currentUserId } from '@/data/session'
import type { Meal, UsualFood, UsualMeal } from '@/domain'
import { MAX_FOLLOW_UPS, MODEL_LABELS, MODEL_TERRA } from '../../../supabase/functions/_shared/prompt'
import { Card } from '../components/Card'
import type { AppSettings } from '@/data/repositories'
import { MEAL_SLOTS, type MealSlot } from '@/domain'
import { useLang } from '../i18n'
import type { StringKey } from '../i18n/strings'

const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'

/** Only estimators that call a provider on the user's behalf need a key. */
const keyMissing = (settings: AppSettings): boolean => estimatorRequiresKey() && !settings.apiKey

/** How the docked bar names this meal while it is being read. */
const SLOT_LABEL = (slot: MealSlot): StringKey => `common.slotLabel.${slot}` as StringKey

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

/**
 * The three ways in.
 *
 * Photo is first because it is the one that needs the camera in your hand;
 * Write is for the meal you have already eaten or never photographed; Again is
 * for the boring days, which are most of them.
 */
export type LogMode = 'photo' | 'write' | 'again'

const MODES = (t: (key: StringKey) => string): readonly ModeTab<LogMode>[] => [
  { value: 'photo', label: t('log.mode.photo'), description: t('log.mode.photo.description') },
  { value: 'write', label: t('log.mode.write'), description: t('log.mode.write.description') },
  { value: 'again', label: t('log.mode.again'), description: t('log.mode.again.description') },
]

const isMode = (value: string | null): value is LogMode =>
  value === 'photo' || value === 'write' || value === 'again'

/**
 * The app's front door: photograph food, describe it, or repeat it.
 *
 * The mode lives in the URL so the tab survives a reload and can be linked to
 * — "log by hand instead" and the Again link both need somewhere to point.
 *
 * A photo lives in memory for the duration of the analysis and is never
 * written anywhere (spec §3) — Retry reuses it, saving or clearing drops it.
 */
export function Log() {
  const { t, lang } = useLang()
  const { runWrite, trial, revision } = useDataRevision()
  const { logRepeat, logFoods, logDay, deleteMeal, deleteMeals } = useActions()
  const [params, setParams] = useSearchParams()
  const mode: LogMode = isMode(params.get('mode')) ? (params.get('mode') as LogMode) : 'photo'
  const setMode = (next: LogMode) => {
    const updated = new URLSearchParams(params)
    if (next === 'photo') updated.delete('mode')
    else updated.set('mode', next)
    setParams(updated, { replace: true })
  }

  const [usuals, setUsuals] = useState<Usuals>()
  /** The meal just logged from a usual, kept so it can be taken back. */
  const [justLogged, setJustLogged] = useState<{ meals: Meal[]; label: string }>()
  const [logging, setLogging] = useState(false)
  const { analysis, start, startText, retry, clear, answerQuestion } = useAnalysis()
  const running = analysis?.status === 'running'
  const runningPhoto = running && analysis?.input.kind === 'photo'
  const elapsed = useElapsed(analysis?.startedAt, running)

  /**
   * The rationale card under a running photo, said once and never again.
   *
   * Shown for the whole run once it appears, independent of `useElapsed`'s
   * per-second re-renders — reading `hasSeenNotice` straight from render
   * would flip it off mid-wait the instant the effect below marks it seen.
   */
  const [showAnalyzingExplainer, setShowAnalyzingExplainer] = useState(false)
  useEffect(() => {
    if (!runningPhoto) {
      setShowAnalyzingExplainer(false)
      return
    }
    if (!hasSeenNotice('analyzing-explainer')) {
      setShowAnalyzingExplainer(true)
      markNoticeSeen('analyzing-explainer')
    }
  }, [runningPhoto])

  const [settings, setSettings] = useState<AppSettings>()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [foodName, setFoodName] = useState('')
  const [grams, setGrams] = useState('')
  /** Free text sent with a photo — what the camera cannot see. */
  const [note, setNote] = useState('')
  /** The sentence being written in Write mode. */
  const [description, setDescription] = useState('')
  const [recent, setRecent] = useState<string[]>(() => readRecentDescriptions())
  const [time, setTime] = useState(hhmm(new Date()))
  const [slot, setSlot] = useState<MealSlot>(suggestSlot(new Date()))
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    void getRepositories().settings.get().then(setSettings)
  }, [])

  // What this person usually eats at this time of day.
  useEffect(() => {
    let cancelled = false
    void readUsuals(currentUserId(), slot)
      .then((found) => !cancelled && setUsuals(found))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [slot, revision])

  const hints = (): EstimateHints => ({
    foodName: foodName.trim() || undefined,
    totalGrams: grams.trim() ? Number(grams) : undefined,
    note: note.trim() || undefined,
    // So the food names and assumptions come back in the language the rest of
    // the screen is already speaking.
    language: lang,
  })

  async function onPhotoChosen(file: File) {
    setSaved(false)
    await start(file, hints(), slot, t(SLOT_LABEL(slot)))
  }

  async function onDescribed() {
    setSaved(false)
    setRecent(rememberDescription(description))
    await startText(description, hints(), slot, t(SLOT_LABEL(slot)))
  }

  /** Drops the input and every hint that belonged to it. */
  function clearInput() {
    clear()
    setFoodName('')
    setGrams('')
    setNote('')
  }

  async function save(corrections?: EstimateCorrection[]) {
    if (!analysis?.result || !analysis.input) return
    const [hours, minutes] = time.split(':').map(Number)
    const at = new Date()
    at.setHours(hours, minutes, 0, 0)

    const { meal, inference } = buildEstimatedMeal(currentUserId(), {
      slot,
      at,
      zone: deviceZone(),
      hints: analysis.hints,
      source:
        analysis.input.kind === 'photo'
          ? { kind: 'photo', photo: analysis.input.meta }
          : { kind: 'text', description: analysis.input.description },
      result: analysis.result,
      corrections,
    })

    setSaving(true)
    const ok = await runWrite('this meal', async () => {
      await getRepositories().inferences.add(inference)
      await getRepositories().meals.add(meal)
    }).finally(() => setSaving(false))

    // The input is only discarded once the save actually landed, so a retry
    // still has something to retry with.
    if (!ok) return
    clearInput()
    setDescription('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const needsKey = settings ? keyMissing(settings) : false
  const fromText = analysis?.input.kind === 'text'
  /** The single most-repeated meal for this hour, offered beside the camera. */
  const usualNow = usuals?.forThisSlot[0]

  return (
    <div className="mx-auto max-w-xl">
      <header className="pb-5">
        <h1 className="font-display text-4xl">{t('log.title')}</h1>
        <p className="pt-1 text-sm text-ink-muted">{t('log.subtitle')}</p>
      </header>

      {/*
        Said once, when it is first true and first useful. New users learn the
        choice exists; the switch to a faster model is announced rather than
        done quietly behind their back.
      */}
      {trial && !trial.exhausted && trial.used === 0 && !analysis && (
        <OneTimeNotice
          id="model-tradeoff"
          title="Accuracy or speed — your choice"
          actionLabel="See the options"
          actionTo="/settings"
        >
          Photos are read by the most accurate model to start with, which takes up to a minute.
          You can trade some accuracy for a much faster answer in Settings, any time.
        </OneTimeNotice>
      )}

      {trial && !trial.exhausted && trial.pastNudge && trial.solRemaining > 0 && (
        <OneTimeNotice
          id="switched-to-terra"
          title={`Switched to ${MODEL_LABELS[MODEL_TERRA].name.toLowerCase()}`}
          actionLabel="Change it"
          actionTo="/settings"
        >
          Your next photos are read by a quicker model — about fifteen seconds instead of a
          minute, and still good. You have {trial.solRemaining} analyses left on the most accurate
          one; save them for a crowded plate.
        </OneTimeNotice>
      )}

      {justLogged && (
        <div className="mb-4 rounded-card border border-leaf-soft bg-leaf-soft p-3">
          <p className="text-sm">
            <span className="font-medium">{t('usuals.logged', { label: justLogged.label })}</span> —{' '}
            {t('usuals.loggedNote')}
          </p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                void (justLogged.meals.length === 1
                  ? deleteMeal(justLogged.meals[0])
                  : deleteMeals(justLogged.meals))
                setJustLogged(undefined)
              }}
              className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs"
            >
              {t('usuals.undo')}
            </button>
            <button
              type="button"
              onClick={() => setJustLogged(undefined)}
              className="rounded-full px-3 py-1.5 text-xs text-ink-muted"
            >
              {t('usuals.dismiss')}
            </button>
          </div>
        </div>
      )}

      {/*
        The tabs step aside once something is being estimated: at that point
        there is one thing on screen and one decision to make about it.
      */}
      {!analysis && (
        <ModeTabs tabs={MODES(t)} value={mode} onChange={setMode} label={t('log.modes.label')} />
      )}

      {!analysis && (
        <div role="tabpanel" aria-labelledby={modeTabId(mode)}>
      {mode === 'photo' && (
        <PhotoPanel
          note={note}
          onNoteChange={setNote}
          onPhoto={(file) => void onPhotoChosen(file)}
          usualNow={usualNow}
          slot={slot}
          busy={logging}
          onSeeAll={() => setMode('again')}
          onLogUsual={(usual) => logUsual(usual)}
        />
      )}

      {mode === 'write' && (
        <WritePanel
          value={description}
          onChange={setDescription}
          onEstimate={() => void onDescribed()}
          recent={recent}
          onForgetRecent={(entry) => setRecent(forgetDescription(entry))}
          busy={logging}
        />
      )}

      {/*
        The repeat is a mode rather than a card above the camera: most days are
        not novel, and photographing the same breakfast again costs a minute of
        waiting and a fraction of a cent to be told what you already knew.
      */}
      {mode === 'again' && usuals && (
        <UsualsPanel
          usuals={usuals}
          slot={slot}
          busy={logging}
          searchFirst
          onRepeatMeal={(usual: UsualMeal) => logUsual(usual)}
          onRepeatDay={(source: Meal[]) => {
            setLogging(true)
            void logDay(source)
              .then((meals) => {
                if (meals.length > 0) {
                  setJustLogged({
                    meals,
                    label: t('usuals.fromYesterday', {
                      count: t('usuals.mealCount', { count: meals.length }),
                    }),
                  })
                }
              })
              .finally(() => setLogging(false))
          }}
          onLogFoods={(foods: UsualFood[]) => {
            setLogging(true)
            void logFoods(foods, slot)
              .then((meal) => {
                if (meal) {
                  setJustLogged({ meals: [meal], label: foods.map((f) => f.name).join(', ') })
                }
              })
              .finally(() => setLogging(false))
          }}
        />
      )}

      {mode === 'again' && !usuals && (
        <p className="text-sm text-ink-muted">{t('usuals.looking')}</p>
      )}
        </div>
      )}

      {analysis && (
        <InputPreview
          analysis={analysis}
          elapsed={elapsed}
          onEdit={() => {
            setDescription(analysis.input.kind === 'text' ? analysis.input.description : '')
            clearInput()
            setMode('write')
          }}
        />
      )}

      {/*
        While a photo is being read there is nothing to Analyze (it started
        itself) and nothing to add details to (the hints already went with
        it) — so the generic button row and the details form below both stay
        hidden, and this pair takes their place: give up on it, or go do
        something else while it keeps working.
      */}
      {runningPhoto && (
        <div className="flex flex-wrap gap-3 pt-4">
          <button
            type="button"
            onClick={clearInput}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {t('log.analyzing.cancel')}
          </button>
          <Link
            to="/today"
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {t('log.analyzing.leave')}
          </Link>
        </div>
      )}

      {showAnalyzingExplainer && (
        <div className="mt-4 rounded-card bg-leaf-soft p-5">
          <p className="pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf">
            {t('log.analyzing.whyTitle')}
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">{t('log.analyzing.why')}</p>
        </div>
      )}

      {saved && (
        <p className="pt-4 text-sm text-leaf">
          {t('log.saved')}{' '}
          <Link to="/today" className="underline">
            {t('log.savedLink')}
          </Link>
          .
        </p>
      )}

      {analysis?.error?.exhausted && (
        <Card>
          <h2 className="font-display text-xl">That was the last one on us</h2>
          <p className="pt-1 text-sm text-ink-muted">
            The first {trial?.allowance ?? 10} analyses were run on our account, so you could try
            the app without setting anything up. To keep going, connect your own OpenAI key — it
            takes a couple of minutes, and analysing a meal costs a fraction of a cent.
          </p>
          <div className="flex flex-wrap gap-3 pt-4">
            <Link
              to="/settings"
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
            >
              Connect my key
            </Link>
            <Link
              to="/nutrition"
              className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
            >
              Log by hand instead
            </Link>
          </div>
          <p className="pt-3 text-xs text-ink-muted">
            {fromText
              ? 'What you wrote is still here — connect a key and press Try again.'
              : 'Your photo is still here — connect a key and press Analyze to pick up where you left off.'}
          </p>
        </Card>
      )}

      {needsKey && !trial?.remaining && !analysis && (
        <Card label="One-time setup">
          <p className="text-sm text-ink-muted">
            Photo and text estimates run on your own OpenAI key, so add one to switch them on. A
            meal costs a fraction of a cent to analyze.
          </p>
          <div className="flex flex-wrap gap-3 pt-3">
            <Link
              to="/settings"
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
            >
              Add API key
            </Link>
            <Link
              to="/nutrition"
              className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
            >
              Log by hand instead
            </Link>
          </div>
        </Card>
      )}

      {analysis && !runningPhoto && (
        <div className="pt-4">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            className="text-xs text-ink-muted underline"
          >
            {showDetails ? t('log.details.hide') : t('log.details.show')}
          </button>

          {showDetails && (
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="food">
                  {t('log.details.what')}
                </label>
                <input
                  id="food"
                  className={field}
                  placeholder="Cottage cheese 5%"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                />
                <p className="pt-1 text-xs text-ink-muted">{t('log.details.whatHint')}</p>
              </div>
              <div>
                <label className={label} htmlFor="grams">
                  {t('log.details.grams')}
                </label>
                <input
                  id="grams"
                  type="number"
                  min={0}
                  className={`${field} tabular`}
                  placeholder="250"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                />
                <p className="pt-1 text-xs text-ink-muted">{t('log.details.gramsHint')}</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={label} htmlFor="time">
                    {t('log.details.time')}
                  </label>
                  <input
                    id="time"
                    type="time"
                    className={field}
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className={label} htmlFor="slot">
                    {t('log.details.meal')}
                  </label>
                  <select
                    id="slot"
                    className={field}
                    value={slot}
                    onChange={(e) => setSlot(e.target.value as MealSlot)}
                  >
                    {MEAL_SLOTS.map((option) => (
                      <option key={option} value={option}>
                        {t(`common.slot.${option}` as StringKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {analysis && !analysis.result && !analysis.error?.exhausted && !runningPhoto && (
        <div className="flex flex-wrap gap-3 pt-4">
          {!running && (
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface"
            >
              {analysis.error
                ? t('log.action.tryAgain')
                : fromText
                  ? t('log.write.estimate')
                  : t('log.action.analyze')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              clearInput()
              if (fromText) setMode('write')
            }}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {fromText ? t('log.action.startOver') : t('log.action.discardPhoto')}
          </button>
        </div>
      )}

      {analysis?.error && !analysis.error.exhausted && (
        <Card>
          <p className="text-sm text-accent">{analysis.error.message}</p>
          {analysis.error.retryable && (
            <p className="pt-1 text-xs text-ink-muted">
              {fromText ? t('log.error.stillHereText') : t('log.error.stillHerePhoto')}{' '}
              {t('log.error.retryOr')}{' '}
              <Link to="/nutrition" className="underline">
                {t('log.error.logByHand')}
              </Link>
              .
            </p>
          )}
        </Card>
      )}

      {analysis?.result && (
        <EstimateCard
          result={analysis.result}
          downgraded={analysis.downgraded}
          fromText={fromText}
          saving={saving}
          onAnswer={analysis.answers.length < MAX_FOLLOW_UPS ? answerQuestion : undefined}
          onSave={(corrections) => void save(corrections)}
          onDiscard={() => {
            clearInput()
            if (fromText) setMode('write')
          }}
        />
      )}
    </div>
  )

  function logUsual(usual: UsualMeal) {
    setLogging(true)
    void logRepeat(usual, slot)
      .then((meal) => {
        if (meal) {
          setJustLogged({
            meals: [meal],
            label: usual.template.items.map((i) => i.name).join(', '),
          })
        }
      })
      .finally(() => setLogging(false))
  }
}
