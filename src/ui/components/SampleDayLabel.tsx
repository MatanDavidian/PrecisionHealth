import { isGeneratedId } from '@/data/adoption'
import type { DayData } from '../useHealthData'
import { useDataRevision } from '../DataProvider'
import { useT } from '../i18n'

/**
 * Says so when the day on screen is the made-up sample day (Q5).
 *
 * Signed out, a fresh install is seeded with a day of meals and a workout so
 * there is something to look at. Without a label, a stranger — or an app-store
 * reviewer — sees what looks like a real person's food log. Seeded records
 * have fixed ids, real ones are UUIDs (`isGeneratedId`), so the label shows
 * exactly while any sample record is on screen, and never in an account,
 * which is never seeded.
 */
export function SampleDayLabel({ data }: { data?: DayData }) {
  const t = useT()
  const { session } = useDataRevision()
  if (session.authenticated || !data) return null
  const ids = [...data.meals.map((m) => m.id), ...data.workouts.map((w) => w.id), data.sleep?.id]
  if (!ids.some((id) => id && !isGeneratedId(id))) return null
  return (
    <p role="note" className="mb-4 rounded-card border border-dashed border-hairline px-4 py-3 text-sm">
      <span className="font-medium">{t('sample.title')}</span>{' '}
      <span className="text-ink-muted">{t('sample.body')}</span>
    </p>
  )
}
