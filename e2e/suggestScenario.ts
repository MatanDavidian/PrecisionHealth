import { expect, type Page } from '@playwright/test'
import { NOW, open, pinTime } from './app'

/**
 * A week written straight into the browser's store, for the suggestion card
 * (meal-suggestions-precision.md): every number on the card is then known.
 * Used by e2e/meal-suggestion-scenarios.spec.ts.
 */

const TARGET = { kcal: 2150, protein: 145, fat: 70, carbs: 235 }

export type Slot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'
export interface Food {
  kcal: number
  protein: number
  /** Defaults to 30% of the calories, as the targets split them. */
  fat?: number
  slot?: Slot
  /** Local "HH:MM". */
  time?: string
}

export interface Scenario {
  /** The local time on the pinned day: "20:40". Midday when not given. */
  at?: string
  /** Days to move today by: -3 is the Sunday that starts the week. */
  shiftDays?: number
  today: Food[]
  /** Earlier days, by how many days back (1 = yesterday). */
  days?: Record<number, Food[]>
  /** What a past day really burned, as a watch would record it. */
  burns?: Record<number, number>
  /** Clear today's workout, which the sample has (62 minutes of strength). */
  restDay?: boolean
}

const NAMES: Record<Slot, string> = {
  BREAKFAST: 'Eggs and oats',
  LUNCH: 'Chicken and rice',
  DINNER: 'Salmon and potatoes',
  SNACK: 'Yogurt and fruit',
}

/** A whole day, on target unless told otherwise, as one lunch. */
export const day = (kcal = TARGET.kcal, protein = TARGET.protein, fat?: number): Food[] => [{ kcal, protein, fat }]

/** Sunday to Tuesday, each day the same. */
export const weekOf = (food: Food[]): Record<number, Food[]> => ({ 1: food, 2: food, 3: food })

export async function scenario(page: Page, s: Scenario) {
  const at = new Date(NOW)
  at.setDate(at.getDate() + (s.shiftDays ?? 0))
  const [h, m] = (s.at ?? '12:00').split(':').map(Number)
  at.setHours(h, m, 0, 0)
  await pinTime(page, at)

  // The sample is seeded on the first open; then it is replaced.
  await open(page, '/today')
  await expect(page.getByTestId('targets-card')).toBeVisible({ timeout: 15_000 })

  const days: { back: number; foods: Food[] }[] = [
    { back: 0, foods: s.today },
    ...Object.entries(s.days ?? {}).map(([back, foods]) => ({ back: Number(back), foods })),
  ]
  await page.evaluate(
    async ({ days, burns, restDay, names }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const request = indexedDB.open('timeline-health')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const pad = (n: number) => String(n).padStart(2, '0')
      const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const dayBack = (back: number) => {
        const d = new Date()
        d.setDate(d.getDate() - back)
        return d
      }
      const q = (value: number, unit: string) => ({ value, unit, __canonical: true })
      const all = (name: string) =>
        new Promise<{ id: string; day: string; code?: string }[]>((resolve) => {
          const request = db.transaction(name).objectStore(name).getAll()
          request.onsuccess = () => resolve(request.result)
        })
      const [observations, workouts] = await Promise.all([all('observations'), all('workouts')])
      const today = dayKey(new Date())

      const tx = db.transaction(['meals', 'observations', 'workouts'], 'readwrite')
      tx.objectStore('meals').clear()
      for (const o of observations) if (o.code === 'TOTAL_ENERGY') tx.objectStore('observations').delete(o.id)
      if (restDay) for (const w of workouts) if (w.day === today) tx.objectStore('workouts').delete(w.id)

      let n = 0
      for (const { back, foods } of days) {
        const date = dayBack(back)
        const key = dayKey(date)
        for (const food of foods) {
          const slot = food.slot ?? 'LUNCH'
          const [hh, mm] = (food.time ?? (slot === 'BREAKFAST' ? '08:00' : slot === 'DINNER' ? '20:00' : '13:00'))
            .split(':')
            .map(Number)
          const time = new Date(date)
          time.setHours(hh, mm, 0, 0)
          const fat = food.fat ?? Math.round((food.kcal * 0.3) / 9)
          const carbs = Math.max(0, Math.round((food.kcal - food.protein * 4 - fat * 9) / 4))
          const id = `scenario-${++n}`
          const recordedAt = time.toISOString()
          const provenance = { source: 'USER', kind: 'RAW', recordedAt }
          tx.objectStore('meals').put({
            id: `${id}-v1`,
            mealId: id,
            version: 1,
            userId: 'user-demo',
            day: key,
            data: {
              id,
              recordId: `${id}-v1`,
              version: 1,
              userId: 'user-demo',
              slot,
              time: { kind: 'instant', at: recordedAt, zone },
              items: [
                {
                  id: `${id}-item`,
                  mealId: id,
                  name: names[slot],
                  // About 1.5 kcal a gram: an ordinary plate, and macros that fit in it.
                  amount: q(Math.round(food.kcal / 1.5), 'g'),
                  nutrients: {
                    energy: q(food.kcal, 'kcal'),
                    protein: q(food.protein, 'g'),
                    carbs: q(carbs, 'g'),
                    fat: q(fat, 'g'),
                  },
                  provenance,
                },
              ],
              provenance,
            },
          })
        }
      }
      for (const [back, kcal] of Object.entries(burns)) {
        const key = dayKey(dayBack(Number(back)))
        const id = `scenario-burn-${back}`
        tx.objectStore('observations').put({
          id,
          userId: 'user-demo',
          day: key,
          code: 'TOTAL_ENERGY',
          data: {
            id,
            userId: 'user-demo',
            code: 'TOTAL_ENERGY',
            time: { kind: 'daily', date: key, zone },
            value: q(kcal, 'kcal'),
            provenance: { source: 'GARMIN', kind: 'RAW', recordedAt: `${key}T21:50:00.000Z` },
          },
        })
      }
      await new Promise((resolve) => (tx.oncomplete = resolve))
      db.close()
    },
    { days, burns: s.burns ?? {}, restDay: s.restDay ?? false, names: NAMES },
  )
  await open(page, '/today')
  await expect(page.getByTestId('targets-card')).toBeVisible({ timeout: 15_000 })
}

/** A day of the pinned week as the card writes it: "Wed 25 Nov", or in Hebrew with its weekday letter. */
export const label = (back: number, lang: 'en' | 'he' = 'en') => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - back)
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
/** A day of the pinned week as a date key: "2026-11-24". */
export const dayKeyBack = (back: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - back)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** The period Sunday to the pinned Wednesday. */
export const PERIOD = `${label(3)} – ${label(0)}`

