import {
  MODEL_LABELS,
  MODEL_SOL,
  MODEL_TERRA,
  MODEL_LUNA,
} from '../../../supabase/functions/_shared/prompt'
import type { TrialStatus } from '@/data/trial'
import { useT } from '../i18n'

const ORDER = [MODEL_SOL, MODEL_TERRA, MODEL_LUNA]

/**
 * Accuracy against speed, while on the free trial.
 *
 * The best model is expensive and slow, so the trial gives it a small budget
 * of its own. Rather than hiding that, the picker shows what is left of it and
 * lets the user spend it where it matters — a crowded plate, an unfamiliar
 * dish — instead of on a bowl of porridge.
 */
export function TrialModelPicker({
  trial,
  selected,
  onSelect,
}: {
  trial: TrialStatus
  /** Undefined means "follow the app's suggestion". */
  selected?: string
  onSelect: (model: string) => void
}) {
  const t = useT()
  const effective = selected ?? trial.suggestedModel

  return (
    <div className="space-y-2">
      {ORDER.map((model) => {
        const label = MODEL_LABELS[model]
        const isSol = model === MODEL_SOL
        const locked = isSol && trial.solRemaining === 0
        const active = effective === model

        return (
          <label
            key={model}
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              locked
                ? 'cursor-default border-hairline opacity-50'
                : 'cursor-pointer border-hairline'
            } ${active && !locked ? 'bg-card-soft' : ''}`}
          >
            <input
              type="radio"
              name="trialModel"
              className="mt-1"
              checked={active && !locked}
              disabled={locked}
              onChange={() => onSelect(model)}
            />
            <span>
              <span className="text-sm font-medium">
                {label.name}
                {isSol && !locked && trial.solRemaining <= trial.solAllowance && (
                  <span className="ms-2 rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-normal text-accent">
                    {t('trial.left', { count: trial.solRemaining })}
                  </span>
                )}
                {locked && (
                  <span className="ms-2 rounded-full bg-card-soft px-2 py-0.5 text-[0.65rem] font-normal text-ink-muted">
                    {t('trial.usedUp')}
                  </span>
                )}
              </span>
              <span className="block pt-0.5 text-xs text-ink-muted">
                {locked ? t('trial.availableAgain') : label.detail}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
