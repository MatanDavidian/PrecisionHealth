import { MODEL_LABELS, TRIAL_MODELS } from '../../../supabase/functions/_shared/prompt'
import { useT } from '../i18n'

/**
 * Which model analyses your photos, on the free trial or the plan.
 *
 * A dropdown of every model the SERVER allows (`TRIAL_MODELS`) — the server
 * refuses anything else, so the list cannot offer a model that would fail.
 * Adding a model there adds it here; nothing in this file names one.
 *
 * Each option shows its plain-language label and the real model id, because
 * the owner compares models by id while evaluating them, and a user deserves
 * to know which model read their plate.
 */
export function ModelPicker({
  suggestedModel,
  selected,
  onSelect,
}: {
  /** The server's default, used until the person chooses. */
  suggestedModel: string
  /** Undefined means "follow the app's suggestion". */
  selected?: string
  onSelect: (model: string) => void
}) {
  const t = useT()
  const requested = selected ?? suggestedModel
  // A choice that is no longer offered (a retired model) falls back to the suggestion.
  const effective = TRIAL_MODELS.includes(requested as never) ? requested : suggestedModel
  const detail = MODEL_LABELS[effective]?.detail

  return (
    <div>
      <select
        id="trialModel"
        name="trialModel"
        aria-label={t('settings.accuracyOrSpeed')}
        className="w-full rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm"
        value={effective}
        onChange={(event) => onSelect(event.target.value)}
      >
        {TRIAL_MODELS.map((model) => {
          const label = MODEL_LABELS[model]?.name
          return (
            <option key={model} value={model}>
              {label ? `${label} · ${model}` : model}
            </option>
          )
        })}
      </select>
      <p className="pt-2 text-xs text-ink-muted">
        {detail}
      </p>
    </div>
  )
}
