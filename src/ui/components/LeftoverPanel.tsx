import { useRef, useState } from 'react'
import { getEstimator } from '@/data'
import { describePhoto, downscale } from '@/ai/photo'
import { plateOf, previewLeftover, type LeftoverPreview } from '@/data/leftoverMeal'
import type { LeftoverEstimate, Meal } from '@/domain'
import { useLang } from '../i18n'
import { fieldClass as field } from './NumberField'
import { PILL, PILL_OFF, PILL_ON } from './segmented'

type Source = { kind: 'photo'; sha256: string } | { kind: 'text'; description: string }

/**
 * What came back on the plate.
 *
 * A meal-level control, deliberately — unlike Refill, which belongs to one
 * food. You point it at the plate and it works out each food separately,
 * because "I finished the chicken and left half the rice" is the normal shape
 * of a leftover and one percentage across the meal cannot say it.
 *
 * The result is applied as its own write rather than merged into the edit in
 * progress. These numbers came from a model looking at a photograph, so they
 * carry its provenance and want confirming; folding them into the manual edit
 * would stamp them as numbers the person vouched for, which they are not.
 */
export function LeftoverPanel({
  meal,
  onApply,
  onClose,
}: {
  meal: Meal
  onApply: (estimate: LeftoverEstimate, source: Source) => Promise<unknown>
  onClose: () => void
}) {
  const { t, lang } = useLang()
  const [mode, setMode] = useState<'photo' | 'describe'>('photo')
  const [description, setDescription] = useState('')
  const [photoName, setPhotoName] = useState<string>()
  const photo = useRef<Blob>()
  const [state, setState] = useState<
    { kind: 'input' } | { kind: 'estimating' } | { kind: 'failed'; message: string }
  >({ kind: 'input' })
  const [result, setResult] = useState<{ estimate: LeftoverEstimate; preview: LeftoverPreview; source: Source }>()
  const [applying, setApplying] = useState(false)

  const plate = plateOf(meal)

  async function estimate() {
    setState({ kind: 'estimating' })
    try {
      let source: Source
      let estimated: LeftoverEstimate
      if (mode === 'photo' && photo.current) {
        // Downscaled before it leaves, exactly as the Log screen does: a phone
        // photo is several megabytes and none of that detail helps.
        const small = await downscale(photo.current)
        const meta = await describePhoto(small)
        estimated = await getEstimator().estimateLeftover({ photo: small }, plate, { language: lang })
        source = { kind: 'photo', sha256: meta.sha256 }
      } else {
        const said = description.trim()
        estimated = await getEstimator().estimateLeftover({ description: said }, plate, { language: lang })
        source = { kind: 'text', description: said }
      }
      setResult({ estimate: estimated, preview: previewLeftover(meal, estimated), source })
      setState({ kind: 'input' })
    } catch (cause) {
      setState({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  if (result) {
    const { preview } = result
    return (
      <div className="mt-3 rounded-card border border-hairline bg-canvas p-3.5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {t('leftover.share', { percent: Math.round(preview.eaten * 100) })}
        </p>

        {preview.rows.map((row) => (
          <div
            key={row.name}
            className="flex flex-wrap items-baseline justify-between gap-2 border-t border-hairline py-2 first:mt-2"
          >
            <span className="text-sm" dir="auto">
              {row.name}
              {row.note && <span className="text-ink-muted"> · {row.note}</span>}
            </span>
            <span className="tabular ltr-nums text-xs text-ink-muted">
              {Math.round(row.eatenFraction * 100)}%
            </span>
          </div>
        ))}

        <p className="max-w-[52ch] pt-2.5 text-xs leading-relaxed text-ink-muted">
          {preview.changesAnything ? t('leftover.willScale') : t('leftover.nothingLeft')}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-3.5">
          {preview.changesAnything && (
            <button
              type="button"
              disabled={applying}
              onClick={() => {
                setApplying(true)
                void onApply(result.estimate, result.source).finally(() => setApplying(false))
              }}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
            >
              {applying ? t('estimate.saving') : t('leftover.apply')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setResult(undefined)}
            className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
          >
            {t('leftover.again')}
          </button>
          <button type="button" onClick={onClose} className="text-xs text-ink-muted underline">
            {t('editor.cancel')}
          </button>
        </div>
      </div>
    )
  }

  const ready = mode === 'photo' ? Boolean(photo.current) : description.trim().length > 0

  return (
    <div className="mt-3 rounded-card border border-hairline bg-canvas p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {t('leftover.whatsLeft')}
        </p>
        <div className="flex gap-1 rounded-full bg-card p-1">
          {(['photo', 'describe'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className={`px-3 py-1 ${PILL} ${mode === option ? PILL_ON : PILL_OFF}`}
            >
              {t(option === 'photo' ? 'log.mode.photo' : 'nutrition.modeDescribe')}
            </button>
          ))}
        </div>
      </div>

      {mode === 'photo' ? (
        <label className="flex cursor-pointer items-center justify-center rounded-card border border-dashed border-hairline bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              photo.current = file
              setPhotoName(file.name)
            }}
          />
          {photoName ?? t('leftover.photoPrompt')}
        </label>
      ) : (
        <textarea
          id="leftover-describe"
          rows={2}
          dir="auto"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('leftover.describePrompt')}
          className={`${field} resize-y`}
        />
      )}

      {state.kind === 'failed' && (
        <p className="pt-2 text-sm text-accent" dir="auto">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-3">
        <button
          type="button"
          onClick={estimate}
          disabled={!ready || state.kind === 'estimating'}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {state.kind === 'estimating' ? t('describe.estimating') : t('leftover.estimate')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
        >
          {t('editor.cancel')}
        </button>
      </div>
    </div>
  )
}
