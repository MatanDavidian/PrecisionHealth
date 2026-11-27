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
  /** Active calories by day back (0 = today), from the watch; replaces the sample's. */
  active?: Record<number, number>
  /** Today's workouts, replacing the sample's. */
  workouts?: { kind: string; minutes: number }[]
  /** When each night began, by its wake day back (0 = last night); replaces the sample's sleep. */
  sleepStarts?: Record<number, string>
  /** Weigh-ins by day back, in kg; replaces the sample's weights. */
  weighIns?: Record<number, number>
  /** Open the suggestion card's details behind ⓘ at the end (the default), or leave them closed. */
  details?: boolean
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
    async ({ days, burns, restDay, names, active, workouts, sleepStarts, weighIns }) => {
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
      const [observations, storedWorkouts] = await Promise.all([all('observations'), all('workouts')])
      const today = dayKey(new Date())

      const tx = db.transaction(['meals', 'observations', 'workouts', 'sleep'], 'readwrite')
      tx.objectStore('meals').clear()
      for (const o of observations) {
        if (o.code === 'TOTAL_ENERGY') tx.objectStore('observations').delete(o.id)
        if (active && o.code === 'ACTIVE_ENERGY') tx.objectStore('observations').delete(o.id)
        if (weighIns && o.code === 'WEIGHT') tx.objectStore('observations').delete(o.id)
      }
      if (restDay || workouts) for (const w of storedWorkouts) if (w.day === today) tx.objectStore('workouts').delete(w.id)
      if (sleepStarts) tx.objectStore('sleep').clear()
      const observation = (id: string, code: string, key: string, value: unknown, time: unknown, source: string) =>
        tx.objectStore('observations').put({
          id,
          userId: 'user-demo',
          day: key,
          code,
          data: { id, userId: 'user-demo', code, time, value, provenance: { source, kind: 'RAW', recordedAt: `${key}T21:50:00.000Z` } },
        })
      for (const [back, kcal] of Object.entries(active ?? {})) {
        const key = dayKey(dayBack(Number(back)))
        observation(`scenario-active-${back}`, 'ACTIVE_ENERGY', key, q(kcal, 'kcal'), { kind: 'daily', date: key, zone }, 'GARMIN')
      }
      for (const [back, kg] of Object.entries(weighIns ?? {})) {
        const date = dayBack(Number(back))
        date.setHours(7, 0, 0, 0)
        const key = dayKey(date)
        observation(`scenario-weight-${back}`, 'WEIGHT', key, q(kg * 1000, 'g'), { kind: 'instant', at: date.toISOString(), zone }, 'SMART_SCALE')
      }
      for (const [i, workout] of (workouts ?? []).entries()) {
        const start = new Date()
        start.setHours(7, 0, 0, 0)
        const end = new Date(start.getTime() + workout.minutes * 60_000)
        const id = `scenario-workout-${i}`
        tx.objectStore('workouts').put({
          id,
          userId: 'user-demo',
          day: today,
          data: {
            id,
            userId: 'user-demo',
            type: workout.kind,
            time: { kind: 'interval', start: start.toISOString(), end: end.toISOString(), zone },
            duration: q(workout.minutes * 60, 's'),
            exercises: [],
            provenance: { source: 'GARMIN', kind: 'RAW', recordedAt: end.toISOString() },
          },
        })
      }
      for (const [back, startTime] of Object.entries(sleepStarts ?? {})) {
        const wake = dayBack(Number(back))
        const [sh, sm] = startTime.split(':').map(Number)
        const start = new Date(wake)
        // A night that starts before midnight began the evening before its wake day.
        if (sh >= 12) start.setDate(start.getDate() - 1)
        start.setHours(sh, sm, 0, 0)
        const end = new Date(start.getTime() + 7 * 3600_000)
        const id = `scenario-sleep-${back}`
        tx.objectStore('sleep').put({
          id,
          userId: 'user-demo',
          day: dayKey(wake),
          data: {
            id,
            userId: 'user-demo',
            time: { kind: 'interval', start: start.toISOString(), end: end.toISOString(), zone },
            duration: q(7 * 3600, 's'),
            provenance: { source: 'GARMIN', kind: 'RAW', recordedAt: end.toISOString() },
          },
        })
      }

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
    {
      days,
      burns: s.burns ?? {},
      restDay: s.restDay ?? false,
      names: NAMES,
      active: s.active,
      workouts: s.workouts,
      sleepStarts: s.sleepStarts,
      weighIns: s.weighIns,
    },
  )
  await openSuggestions(page, s.details ?? true)
}

/**
 * Nutrition, where the suggestion card lives (today only), with its details
 * behind ⓘ opened unless `details` is false.
 */
export async function openSuggestions(page: Page, details = true) {
  await open(page, '/nutrition')
  await expect(page.getByTestId('nutrition-total-kcal')).toBeVisible({ timeout: 15_000 })
  if (!details) return
  const toggle = page.getByTestId('suggest-info-toggle')
  await toggle.waitFor({ timeout: 5_000 }).catch(() => undefined)
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
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
/** The card's period: the last seven days, to the pinned Wednesday. */
export const PERIOD = `${label(6)} – ${label(0)}`

