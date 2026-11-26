import { useEffect, useState } from 'react'
import { FOOD_DIETS, MAX_AVOID_CHARS, type FoodDiet, type FoodPreferences as Preferences } from '@/domain'
import { Card } from './Card'
import { useLang } from '../i18n'
import type { StringKey } from '../i18n/strings'

/**
 * Food preferences (docs/features/meal-suggestions.md): ways of eating and
 * anything to avoid, which every suggestion must follow. In Settings → Goals.
 *
 * Sent to the model only with a request for suggestions. The note under them
 * says so, and says that a choice like "no meat with dairy" can say something
 * about beliefs: the person decides what to write.
 */
export function FoodPreferences({
  value,
  onSave,
}: {
  value?: Preferences
  onSave: (preferences: Preferences) => Promise<unknown>
}) {
  const { t } = useLang()
  const diets = value?.diets ?? []
  const [avoid, setAvoid] = useState(value?.avoid ?? '')
  /** "Saved", for a moment after each save: the words save when the field is left, which is otherwise silent. */
  const [saved, setSaved] = useState(false)
  const save = (preferences: Preferences) => {
    setSaved(false)
    void onSave(preferences).then(() => setSaved(true))
  }
  useEffect(() => setAvoid(value?.avoid ?? ''), [value?.avoid])

  const toggle = (diet: FoodDiet) =>
    save({
      diets: diets.includes(diet) ? diets.filter((d) => d !== diet) : FOOD_DIETS.filter((d) => d === diet || diets.includes(d)),
      ...(avoid.trim() ? { avoid: avoid.trim() } : {}),
    })

  const saveAvoid = () => {
    if (avoid.trim() === (value?.avoid ?? '')) return
    save({ diets, ...(avoid.trim() ? { avoid: avoid.trim() } : {}) })
  }

  return (
    <Card label={t('prefs.title')}>
      <div id="food-preferences" data-testid="food-preferences">
        <p className="pb-3 text-sm">{t('prefs.lead')}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('prefs.diets')}>
          {FOOD_DIETS.map((diet) => {
            const on = diets.includes(diet)
            return (
              <button
                key={diet}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(diet)}
                className={`rounded-full border px-[14px] py-[7px] text-[13.5px] transition-colors ${
                  on ? 'border-ink bg-ink font-medium text-canvas' : 'border-hairline bg-surface hover:bg-card-soft'
                }`}
              >
                {t(`prefs.diet.${diet}` as StringKey)}
              </button>
            )
          })}
        </div>
        <label htmlFor="food-avoid" className="block pb-1.5 pt-4 text-[13px] font-medium">
          {t('prefs.avoid')}
        </label>
        <input
          id="food-avoid"
          value={avoid}
          maxLength={MAX_AVOID_CHARS}
          onChange={(e) => setAvoid(e.target.value)}
          onBlur={saveAvoid}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          placeholder={t('prefs.avoidPlaceholder')}
          className="w-full rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <p className="h-4 pt-1.5 text-xs text-ink-soft" role="status" aria-live="polite" data-testid="food-preferences-saved">
          {saved ? t('settings.saved') : ''}
        </p>
        <p className="pt-2.5 text-xs leading-relaxed text-ink-muted">{t('prefs.note')}</p>
      </div>
    </Card>
  )
}
