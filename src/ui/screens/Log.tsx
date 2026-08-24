import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { estimatorRequiresKey, getRepositories } from '@/data'
import type { EstimateHints, EstimateResult } from '@/ai/estimator'
import { buildPhotoMeal } from '@/data/photoMeal'
import { deviceZone, suggestSlot } from '@/data/newRecords'
import { useDataRevision } from '../DataProvider'
import { formatElapsed, useAnalysis, useElapsed } from '../AnalysisProvider'
import { useActions } from '../useHealthData'
import { OneTimeNotice } from '../components/OneTimeNotice'
import { UsualsPanel } from '../components/UsualsPanel'
import { readUsuals, type Usuals } from '@/data/usuals'
import { currentUserId } from '@/data/session'
import type { Meal, UsualFood, UsualMeal } from '@/domain'
import { MODEL_LABELS, MODEL_TERRA } from '../../../supabase/functions/_shared/prompt'
import { Card } from '../components/Card'
import type { AppSettings } from '@/data/repositories'
import { MEAL_SLOTS, type MealSlot } from '@/domain'

const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'

/** How the docked bar names this meal while it is being read. */
/** Only estimators that call a provider on the user's behalf need a key. */
const keyMissing = (settings: AppSettings): boolean => estimatorRequiresKey() && !settings.apiKey

/** How the docked bar names this meal while it is being read. */
const SLOT_LABEL: Record<MealSlot, string> = {
  NIGHT: 'night meal',
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'snack',
}

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

/**
 * The app's front door: photograph food, tap save.
 *
 * The photo lives in a ref for the duration of this screen and is never
 * written anywhere (spec §3) — Retry reuses it, saving or clearing drops it.
 */
export function Log() {
  const { runWrite, trial, revision } = useDataRevision()
  const { logRepeat, logFoods, logDay, undoMeal, undoMeals } = useActions()
  const [usuals, setUsuals] = useState<Usuals>()
  /** The meal just logged from a usual, kept so it can be taken back. */
  const [justLogged, setJustLogged] = useState<{ meals: Meal[]; label: string }>()
  const [logging, setLogging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { analysis, start, retry, clear } = useAnalysis()
  const running = analysis?.status === 'running'
  const elapsed = useElapsed(analysis?.startedAt, running)

  const [settings, setSettings] = useState<AppSettings>()
  const [saved, setSaved] = useState(false)
  const [foodName, setFoodName] = useState('')
  const [grams, setGrams] = useState('')
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
  })

  async function onPhotoChosen(file: File) {
    setSaved(false)
    await start(file, hints(), slot, SLOT_LABEL[slot])
  }

  function clearPhoto() {
    clear()
    setFoodName('')
    setGrams('')
  }

  async function save() {
    if (!analysis?.result) return
    const [hours, minutes] = time.split(':').map(Number)
    const at = new Date()
    at.setHours(hours, minutes, 0, 0)

    const { meal, inference } = buildPhotoMeal(currentUserId(), {
      slot,
      at,
      zone: deviceZone(),
      hints: analysis.hints,
      photo: analysis.photoMeta,
      result: analysis.result,
    })
    const ok = await runWrite('this meal', async () => {
      await getRepositories().inferences.add(inference)
      await getRepositories().meals.add(meal)
    })
    // The photo is only discarded once the save actually landed, so a retry
    // still has something to retry with.
    if (!ok) return
    clearPhoto()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const needsKey = settings ? keyMissing(settings) : false

  return (
    <div className="mx-auto max-w-xl">
      <header className="pb-5">
        <h1 className="font-display text-4xl">Log</h1>
        <p className="pt-1 text-sm text-ink-muted">Photograph your food — the numbers follow.</p>
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
            <span className="font-medium">{justLogged.label} logged</span> — no photo, no estimate
            to review.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                void (justLogged.meals.length === 1
                  ? undoMeal(justLogged.meals[0])
                  : undoMeals(justLogged.meals))
                setJustLogged(undefined)
              }}
              className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setJustLogged(undefined)}
              className="rounded-full px-3 py-1.5 text-xs text-ink-muted"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/*
        The repeat comes BEFORE the camera on purpose: most days are not novel,
        and photographing the same breakfast again costs a minute of waiting and
        a fraction of a cent to be told what you already knew.
      */}
      {usuals && !analysis && (
        <UsualsPanel
          usuals={usuals}
          slot={slot}
          busy={logging}
          onRepeatMeal={(usual: UsualMeal) => {
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
          }}
          onRepeatDay={(source: Meal[]) => {
            setLogging(true)
            void logDay(source)
              .then((meals) => {
                if (meals.length > 0) {
                  setJustLogged({
                    meals,
                    label: `${meals.length} meal${meals.length === 1 ? '' : 's'} from yesterday`,
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

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onPhotoChosen(file)
          e.target.value = ''
        }}
      />

      {!analysis && (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-hairline bg-card text-ink-muted transition-colors hover:bg-card-soft"
        >
          <CameraIcon />
          <span className="text-sm font-medium text-ink">Take a photo</span>
          <span className="text-xs">or choose one from your library</span>
        </button>
      )}

      {analysis && (
        <div className="relative overflow-hidden rounded-card">
          <img
            src={analysis.photoUrl}
            alt="The meal you photographed"
            className={`w-full object-cover transition-opacity ${running ? 'opacity-60' : ''}`}
          />
          {/*
            The photo IS the progress. On a phone the preview fills the screen,
            so a status line underneath is simply not visible — which is how
            "I took a picture and nothing happened" happens.
          */}
          {running && (
            <div className="absolute inset-x-0 bottom-0 bg-ink/75 px-4 py-3 text-surface">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="size-2 animate-pulse rounded-full bg-surface" />
                Reading your plate…
                <span className="tabular font-normal opacity-80">
                  {formatElapsed(elapsed)} · usually about 15 seconds
                </span>
              </p>
              <p className="pt-0.5 text-xs opacity-75">
                You can leave — it keeps going, and the bar below stays until it's done.
              </p>
            </div>
          )}
        </div>
      )}

      {saved && (
        <p className="pt-4 text-sm text-leaf">
          Saved. <Link to="/today" className="underline">See today</Link>.
        </p>
      )}

      {analysis?.error?.exhausted && (
        <Card>
          <h2 className="font-display text-xl">That was the last one on us</h2>
          <p className="pt-1 text-sm text-ink-muted">
            The first {trial?.allowance ?? 10} photos were analysed on our account, so you could
            try the app without setting anything up. To keep going, connect your own OpenAI key —
            it takes a couple of minutes, and analysing a photo costs a fraction of a cent.
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
            Your photo is still here — connect a key and press Analyze to pick up where you left
            off.
          </p>
        </Card>
      )}

      {needsKey && !trial?.remaining && (
        <Card label="One-time setup">
          <p className="text-sm text-ink-muted">
            Photo analysis runs on your own OpenAI key, so add one to switch it on. A photo costs a
            fraction of a cent to analyze.
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

      {analysis && (
        <div className="pt-4">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            className="text-xs text-ink-muted underline"
          >
            {showDetails ? 'Hide details' : 'Add details (optional)'}
          </button>

          {showDetails && (
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="food">
                  What is it
                </label>
                <input
                  id="food"
                  className={field}
                  placeholder="Cottage cheese 5%"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                />
                <p className="pt-1 text-xs text-ink-muted">
                  Naming it stops the model guessing the identification.
                </p>
              </div>
              <div>
                <label className={label} htmlFor="grams">
                  Total grams
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
                <p className="pt-1 text-xs text-ink-muted">Weighing it is the biggest accuracy win.</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={label} htmlFor="time">
                    Time
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
                    Meal
                  </label>
                  <select
                    id="slot"
                    className={field}
                    value={slot}
                    onChange={(e) => setSlot(e.target.value as MealSlot)}
                  >
                    {MEAL_SLOTS.map((option) => (
                      <option key={option} value={option}>
                        {option.charAt(0) + option.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {analysis && !analysis.result && !analysis.error?.exhausted && (
        <div className="flex flex-wrap gap-3 pt-4">
          {!running && (
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface"
            >
              {analysis.error ? 'Try again' : 'Analyze'}
            </button>
          )}
          <button
            type="button"
            onClick={clearPhoto}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            Discard photo
          </button>
        </div>
      )}

      {analysis?.error && !analysis.error.exhausted && (
        <Card>
          <p className="text-sm text-accent">{analysis.error.message}</p>
          {analysis.error.retryable && (
            <p className="pt-1 text-xs text-ink-muted">
              Your photo and details are still here — retry, or{' '}
              <Link to="/nutrition" className="underline">
                log it by hand
              </Link>
              .
            </p>
          )}
        </Card>
      )}

      {analysis?.result && (
        <ResultCard
          result={analysis.result}
          downgraded={analysis.downgraded}
          onSave={() => void save()}
          onDiscard={clearPhoto}
        />
      )}
    </div>
  )
}

function ResultCard({
  result,
  downgraded,
  onSave,
  onDiscard,
}: {
  result: EstimateResult
  downgraded?: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  if (result.refusal) {
    return (
      <Card>
        <p className="text-sm">{result.refusal}</p>
        <button
          type="button"
          onClick={onDiscard}
          className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm"
        >
          Try another photo
        </button>
      </Card>
    )
  }

  const total = result.items.reduce(
    (sum, item) => ({
      kcal: sum.kcal + item.energyKcal,
      protein: sum.protein + item.proteinG,
      carbs: sum.carbs + item.carbsG,
      fat: sum.fat + item.fatG,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const lowConfidence = result.overallConfidence < 0.5

  return (
    <div className="pt-4">
      <Card label="Estimate">
        <div className="flex flex-wrap gap-x-6 gap-y-2 pb-3">
          <Figure name="Calories" value={Math.round(total.kcal).toLocaleString()} />
          <Figure name="Protein" value={`${Math.round(total.protein)} g`} />
          <Figure name="Carbs" value={`${Math.round(total.carbs)} g`} />
          <Figure name="Fat" value={`${Math.round(total.fat)} g`} />
        </div>

        {result.items.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="flex flex-wrap items-baseline justify-between gap-2 border-t border-hairline py-2"
          >
            <span className="text-sm">
              {item.name}
              <span className="text-ink-muted"> · {Math.round(item.amountG)} g</span>
            </span>
            <span className="flex items-baseline gap-3">
              <span className="tabular text-xs text-ink-muted">
                {Math.round(item.proteinG)}P · {Math.round(item.carbsG)}C · {Math.round(item.fatG)}F
              </span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent">
                {Math.round(item.confidence * 100)}%
              </span>
            </span>
          </div>
        ))}

        {result.assumptions.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 pt-3 text-xs text-ink-muted">
            {result.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        )}

        {lowConfidence && (
          <p className="pt-3 text-xs text-accent">
            Low confidence — worth checking the numbers before you trust them.
          </p>
        )}

        {downgraded && (
          <p className="pt-3 text-xs text-accent">
            Read by the quicker model — your most-accurate analyses are used up.
          </p>
        )}

        <p className="pt-3 text-xs text-ink-muted">
          Saved as an estimate you can confirm or correct in Nutrition.
        </p>

        <div className="flex flex-wrap gap-3 pt-4">
          <button
            type="button"
            onClick={onSave}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface"
          >
            Save meal
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            Discard
          </button>
        </div>
      </Card>
    </div>
  )
}

function Figure({ name, value }: { name: string; value: string }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">{name}</p>
      <p className="tabular pt-0.5 text-lg font-medium">{value}</p>
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8a1 1 0 0 0 .8-.4l1-1.3a1 1 0 0 1 .8-.4h4.2a1 1 0 0 1 .8.4l1 1.3a1 1 0 0 0 .8.4h1.8A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  )
}
