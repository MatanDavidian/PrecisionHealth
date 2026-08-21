import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { estimator, estimatorRequiresKey, repositories } from '@/data'
import { describePhoto, downscale } from '@/ai/photo'
import {
  ESTIMATE_ERROR_TEXT,
  EstimateError,
  type EstimateHints,
  type EstimateResult,
  type PhotoMeta,
} from '@/ai/estimator'
import { buildFailedInference, buildPhotoMeal } from '@/data/photoMeal'
import { deviceZone, suggestSlot } from '@/data/newRecords'
import { DEMO_USER_ID } from '@/data/mock/seed'
import { useDataRevision } from '../DataProvider'
import { Card } from '../components/Card'
import type { AppSettings } from '@/data/repositories'
import { MEAL_SLOTS, type MealSlot } from '@/domain'

const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'

type Phase =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'result'; result: EstimateResult }
  | { kind: 'error'; message: string; retryable: boolean }
  | { kind: 'saved' }

/** Only the estimators that call a provider on the user's behalf need a key. */
const keyMissing = (settings: AppSettings): boolean => estimatorRequiresKey && !settings.apiKey

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

/**
 * The app's front door: photograph food, tap save.
 *
 * The photo lives in a ref for the duration of this screen and is never
 * written anywhere (spec §3) — Retry reuses it, saving or clearing drops it.
 */
export function Log() {
  const { refresh } = useDataRevision()
  const fileInput = useRef<HTMLInputElement>(null)
  const photoRef = useRef<{ blob: Blob; meta: PhotoMeta } | null>(null)

  const [settings, setSettings] = useState<AppSettings>()
  const [preview, setPreview] = useState<string>()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [foodName, setFoodName] = useState('')
  const [grams, setGrams] = useState('')
  const [time, setTime] = useState(hhmm(new Date()))
  const [slot, setSlot] = useState<MealSlot>(suggestSlot(new Date()))
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    void repositories.settings.get().then(setSettings)
  }, [])

  // Object URLs are the one browser resource here that leaks if ignored.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const hints = (): EstimateHints => ({
    foodName: foodName.trim() || undefined,
    totalGrams: grams.trim() ? Number(grams) : undefined,
  })

  async function analyze() {
    const photo = photoRef.current
    if (!photo) return
    setPhase({ kind: 'analyzing' })
    try {
      const result = await estimator.estimate(photo.blob, hints())
      setPhase({ kind: 'result', result })
    } catch (error) {
      const known = error instanceof EstimateError
      const kind = known ? error.kind : 'UNREADABLE'
      // A failed attempt is part of the audit trail too (spec §6).
      await repositories.inferences.add(
        buildFailedInference(DEMO_USER_ID, {
          at: new Date(),
          model: estimator.model,
          hints: hints(),
          photo: photo.meta,
          kind,
          message: error instanceof Error ? error.message : 'Unknown failure',
          raw: known ? error.raw : undefined,
        }),
      )
      setPhase({
        kind: 'error',
        message: ESTIMATE_ERROR_TEXT[kind],
        retryable: kind !== 'NO_KEY',
      })
    }
  }

  async function onPhotoChosen(file: File) {
    if (preview) URL.revokeObjectURL(preview)
    setPhase({ kind: 'idle' })
    const blob = await downscale(file)
    photoRef.current = { blob, meta: await describePhoto(blob) }
    setPreview(URL.createObjectURL(blob))
    if (settings && !keyMissing(settings) && settings.autoAnalyze) void analyze()
  }

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview)
    photoRef.current = null
    setPreview(undefined)
    setPhase({ kind: 'idle' })
    setFoodName('')
    setGrams('')
  }

  async function save() {
    if (phase.kind !== 'result' || !photoRef.current) return
    const [hours, minutes] = time.split(':').map(Number)
    const at = new Date()
    at.setHours(hours, minutes, 0, 0)

    const { meal, inference } = buildPhotoMeal(DEMO_USER_ID, {
      slot,
      at,
      zone: deviceZone(),
      hints: hints(),
      photo: photoRef.current.meta,
      result: phase.result,
    })
    await repositories.inferences.add(inference)
    await repositories.meals.add(meal)
    refresh()
    clearPhoto()
    setPhase({ kind: 'saved' })
    setTimeout(() => setPhase({ kind: 'idle' }), 2500)
  }

  const needsKey = settings ? keyMissing(settings) : false

  return (
    <div className="mx-auto max-w-xl">
      <header className="pb-5">
        <h1 className="font-display text-4xl">Log</h1>
        <p className="pt-1 text-sm text-ink-muted">Photograph your food — the numbers follow.</p>
      </header>

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

      {!preview && (
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

      {preview && (
        <div className="overflow-hidden rounded-card">
          <img src={preview} alt="The meal you photographed" className="w-full object-cover" />
        </div>
      )}

      {phase.kind === 'saved' && (
        <p className="pt-4 text-sm text-leaf">
          Saved. <Link to="/today" className="underline">See today</Link>.
        </p>
      )}

      {needsKey && (
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

      {preview && (
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

      {preview && phase.kind !== 'result' && (
        <div className="flex flex-wrap gap-3 pt-4">
          {phase.kind !== 'analyzing' && !needsKey && (
            <button
              type="button"
              onClick={() => void analyze()}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-surface"
            >
              {phase.kind === 'error' ? 'Try again' : 'Analyze'}
            </button>
          )}
          {phase.kind === 'analyzing' && (
            <span className="py-2 text-sm text-ink-muted">Analyzing the photo…</span>
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

      {phase.kind === 'error' && (
        <Card>
          <p className="text-sm text-accent">{phase.message}</p>
          {phase.retryable && (
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

      {phase.kind === 'result' && <ResultCard result={phase.result} onSave={() => void save()} onDiscard={clearPhoto} />}
    </div>
  )
}

function ResultCard({
  result,
  onSave,
  onDiscard,
}: {
  result: EstimateResult
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
