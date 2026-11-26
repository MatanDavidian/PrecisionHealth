import { expect, test, type Page } from '@playwright/test'
import { NOW, open, pinTime, switchToHebrew } from './app'

/**
 * What to eat now, every way a day and a week can stand
 * (docs/features/meal-suggestions.md).
 *
 * Each test writes its own week into the browser's store, replacing the
 * sample's meals and burns, so every number on the card is known:
 *
 *   targets  2,150 kcal · protein 145 g · fat 70 g · carbs 235 g
 *            (the sample person; his burn is estimated once the watch's
 *            readings are cleared, so every day's budget is its target)
 *   today    the pinned Wednesday; Sunday to Tuesday are the week before it
 *
 * The plans, as `suggestPlan` decides them:
 *
 *   today has room (after the usual meals still to come) .... FILL
 *   the meals to come take what is left ..................... WAIT
 *   today used or over, protein reached ..................... nothing
 *   today used or over, protein short:
 *     the week's protein ahead .............................. STOP (protein ahead)
 *     room in the week's calories ........................... PROTEIN snack, ≤ 250 kcal and ≤ the room
 *     no room ............................................... STOP (week full)
 */

const TARGET = { kcal: 2150, protein: 145, fat: 70, carbs: 235 }

type Slot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'
interface Food {
  kcal: number
  protein: number
  /** Defaults to 30% of the calories, as the targets split them. */
  fat?: number
  slot?: Slot
  /** Local "HH:MM". */
  time?: string
}

interface Scenario {
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
const day = (kcal = TARGET.kcal, protein = TARGET.protein, fat?: number): Food[] => [{ kcal, protein, fat }]

/** Sunday to Tuesday, each day the same. */
const weekOf = (food: Food[]): Record<number, Food[]> => ({ 1: food, 2: food, 3: food })

async function scenario(page: Page, s: Scenario) {
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

const section = (page: Page) => page.getByTestId('suggest-meals')
const line = (page: Page) => section(page).getByTestId('suggest-line')
const stop = (page: Page) => section(page).getByTestId('suggest-stop')
const suggestions = (page: Page) => page.getByTestId('suggestion')
const weekRow = (page: Page, name: string) =>
  section(page).getByTestId('suggest-week').locator('dt', { hasText: name }).locator('+ dd')

/** Every suggestion's calories, as shown. */
async function suggestedKcal(page: Page): Promise<number[]> {
  const texts = await suggestions(page).getByText(/^[\d,]+ kcal · /).allInnerTexts()
  return texts.map((text) => Number(text.split(' kcal')[0].replace(/[^\d]/g, '')))
}

test.describe('today has room: fill it', () => {
  test('lacking a lot: the whole room, the week as it stands, and suggestions within it', async ({ page }) => {
    await scenario(page, { today: [{ kcal: 400, protein: 25, slot: 'BREAKFAST' }], days: weekOf(day()) })
    await expect(line(page)).toHaveText('Left today: 1,750 kcal · 120 g protein')
    // The week: three days on target, and today so far.
    await expect(weekRow(page, 'Calories')).toHaveText('1,750 under')
    await expect(weekRow(page, 'Protein')).toHaveText('120 g behind')
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    // Up to what is left plus 10%.
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(1925)
  })

  test('a little room, 100 kcal or more: still filled', async ({ page }) => {
    await scenario(page, { today: day(2030, 140), days: weekOf(day()) })
    await expect(line(page)).toHaveText('Left today: 120 kcal · 5 g protein')
    await expect(section(page).getByRole('button', { name: 'Suggest what to eat' })).toBeVisible()
  })

  test('on the first day of the week there is no week to show', async ({ page }) => {
    await scenario(page, { shiftDays: -3, today: [{ kcal: 900, protein: 50 }] })
    await expect(line(page)).toHaveText('Left today: 1,250 kcal · 95 g protein')
    await expect(section(page).getByTestId('suggest-week')).toHaveCount(0)
  })
})

test.describe('today reached its calories, or went over', () => {
  test('at the target with the protein reached: nothing to suggest', async ({ page }) => {
    await scenario(page, { today: day(2150, 145), days: weekOf(day(1800, 120)) })
    await expect(page.getByTestId('targets-status')).toHaveText('On target')
    await expect(section(page)).toHaveCount(0)
  })

  test('over with the protein reached: nothing either, whatever the week', async ({ page }) => {
    await scenario(page, { today: day(2476, 150), days: weekOf(day(1600, 100)) })
    await expect(page.getByTestId('targets-status')).toHaveText('326 over')
    await expect(section(page)).toHaveCount(0)
  })

  test('at the limit, protein short, the week under and behind on protein: a protein snack', async ({ page }) => {
    // 30 kcal left, 25 g short; the week 750 under, today included 780.
    await scenario(page, { today: day(2120, 120), days: weekOf(day(1900, 130)) })
    await expect(line(page)).toHaveText('Left today: 30 kcal · 25 g protein')
    await expect(weekRow(page, 'Calories')).toHaveText('780 under')
    await expect(weekRow(page, 'Protein')).toHaveText('70 g behind')
    await expect(section(page).getByTestId('suggest-hint')).toHaveText('A light protein snack still fits.')
    await section(page).getByRole('button', { name: 'Suggest a protein snack' }).click()
    await expect(section(page).getByRole('heading', { name: /up to 250 kcal/ })).toBeVisible({ timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(250)
  })

  test('at the limit, protein short, but the week is over: better to stop', async ({ page }) => {
    await scenario(page, { today: day(2120, 120), days: weekOf(day(2400, 130)) })
    await expect(weekRow(page, 'Calories')).toHaveText('720 over')
    await expect(stop(page)).toContainText('Better to stop for today.')
    await expect(stop(page)).toContainText('Today’s calories are about used, and the week so far has no room for more.')
    await expect(stop(page)).toContainText('The 25 g of protein can wait: start tomorrow with it.')
    await expect(section(page).getByRole('button', { name: /^Suggest/ })).toHaveCount(0)
  })

  test('over today, protein short, the week with plenty of room: a protein snack of at most 250', async ({ page }) => {
    // 326 over, 11 g short; the week 750 under before today, 424 with it.
    await scenario(page, { today: day(2476, 134), days: weekOf(day(1900, 130)) })
    await expect(line(page)).toHaveText('326 kcal over today · 11 g protein short')
    await expect(weekRow(page, 'Calories')).toHaveText('424 under')
    await section(page).getByRole('button', { name: 'Suggest a protein snack' }).click()
    await expect(section(page).getByRole('heading', { name: /up to 250 kcal/ })).toBeVisible({ timeout: 15_000 })
    // What each adds today, and where the week lands.
    await expect(suggestions(page).first().getByTestId('suggestion-fit')).toHaveText(
      /^\+[\d,]+ kcal today · protein \d+ of 145 g( ✓)? · week [\d,]+ (under|over)$/,
    )
  })

  test('over today, the week with a little room: the snack is capped at that room', async ({ page }) => {
    // The week 450 under before today; 326 over today leaves 124.
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2000, 130)) })
    await expect(weekRow(page, 'Calories')).toHaveText('124 under')
    await section(page).getByRole('button', { name: 'Suggest a protein snack' }).click()
    await expect(section(page).getByRole('heading', { name: /up to 124 kcal/ })).toBeVisible({ timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(124)
  })

  test('over today and over for the week: better to stop, and hungry anyway asks for something light', async ({ page }) => {
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2300, 130)) })
    await expect(weekRow(page, 'Calories')).toHaveText('776 over')
    await expect(stop(page)).toContainText('You’re 326 kcal over today, and the week so far has no room for more.')
    await section(page).getByRole('button', { name: 'Hungry anyway? Suggest something light' }).click()
    await expect(section(page).getByRole('heading', { name: /up to 120 kcal/ })).toBeVisible({ timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(120)
  })

  test('over today, protein short, but the week’s protein is ahead: today’s gap can wait', async ({ page }) => {
    // The week 75 g ahead on protein before today; room in its calories, too.
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2000, 170)) })
    await expect(weekRow(page, 'Protein')).toHaveText('64 g ahead')
    await expect(stop(page)).toContainText(
      'You’re 326 kcal over today, and this week’s protein is 75 g ahead of its targets: today’s 11 g can wait.',
    )
  })

  test('the week over on fat: the snack is a lean one', async ({ page }) => {
    await scenario(page, { today: day(2476, 134), days: weekOf(day(1900, 130, 90)) })
    await expect(weekRow(page, 'Fat')).toHaveText(/^\d+ g over$/)
    await expect(section(page).getByTestId('suggest-hint')).toHaveText(
      'The week is behind on protein and over on fat: a lean protein snack makes sense.',
    )
  })

  test('what a watch recorded counts: a week over its targets has room after big burns', async ({ page }) => {
    // Each day 2,400 against a 2,150 target would leave no room; but each
    // burned 3,200 (a budget of 2,850), so the week is 1,350 under, 1,024 with today.
    await scenario(page, {
      today: day(2476, 134),
      days: weekOf(day(2400, 130)),
      burns: { 1: 3200, 2: 3200, 3: 3200 },
    })
    await expect(weekRow(page, 'Calories')).toHaveText('1,024 under')
    await expect(section(page).getByTestId('suggest-week')).toContainText('Days with a recorded burn count what you really burned.')
    await expect(section(page).getByRole('button', { name: 'Suggest a protein snack' })).toBeVisible()
  })

  test('a watch that stopped counting is not believed', async ({ page }) => {
    // 1,000 burned is a flat battery against a usual 2,500: the day is weighed against its target.
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2300, 130)), burns: { 1: 1000 } })
    await expect(weekRow(page, 'Calories')).toHaveText('776 over')
    await expect(stop(page)).toBeVisible()
  })
})

test.describe('the usual meals still to come', () => {
  /** Ten days of lunch at 13:00 (600) and dinner at 20:00 (650). */
  const usual = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      i + 1,
      [
        { kcal: 600, protein: 45, slot: 'LUNCH' as const, time: '13:00' },
        { kcal: 650, protein: 45, slot: 'DINNER' as const, time: '20:00' },
      ],
    ]),
  )

  test('at 16:30, dinner’s room is kept, and what is suggested is a snack', async ({ page }) => {
    // 1,250 eaten, 900 left; dinner usually 650: 250 now, up to 275.
    await scenario(page, {
      at: '16:30',
      today: [
        { kcal: 650, protein: 40, slot: 'BREAKFAST', time: '08:00' },
        { kcal: 600, protein: 45, slot: 'LUNCH', time: '13:00' },
      ],
      days: usual,
    })
    await expect(section(page).getByTestId('suggest-to-come')).toHaveText(
      'Your usual dinner is still to come, about 650 kcal, so this leaves room for it: up to 275 kcal now.',
    )
    await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
    await expect(suggestions(page)).not.toHaveCount(0, { timeout: 15_000 })
    for (const kcal of await suggestedKcal(page)) expect(kcal).toBeLessThanOrEqual(275)
    // Logged as a snack, so dinner is still to come (and its reminder still comes).
    await suggestions(page).first().getByRole('button', { name: /^Log it: / }).click()
    await expect(section(page).getByRole('status')).toContainText('Logged as snack:')
  })

  test('when dinner takes what is left: better to wait for it', async ({ page }) => {
    await scenario(page, {
      at: '16:30',
      today: [
        { kcal: 950, protein: 60, slot: 'BREAKFAST', time: '08:00' },
        { kcal: 600, protein: 45, slot: 'LUNCH', time: '13:00' },
      ],
      days: usual,
    })
    await expect(stop(page)).toContainText('Better to wait for dinner.')
    await expect(stop(page)).toContainText('It usually comes to about 650 kcal, about what is left today.')
    await expect(section(page).getByRole('button', { name: 'Hungry anyway? Suggest something light' })).toBeVisible()
  })

  test('close to dinner’s usual time, dinner is now: the whole room is offered', async ({ page }) => {
    await scenario(page, {
      at: '19:40',
      today: [{ kcal: 600, protein: 45, slot: 'LUNCH', time: '13:00' }],
      days: usual,
    })
    await expect(line(page)).toHaveText('Left today: 1,550 kcal · 100 g protein')
    await expect(section(page).getByTestId('suggest-to-come')).toHaveCount(0)
  })
})

test.describe('today’s training', () => {
  test('after the sample’s strength session, the card says protein first', async ({ page }) => {
    await scenario(page, { today: day(2120, 120), days: weekOf(day(1900, 130)) })
    await expect(section(page).getByTestId('suggest-training')).toHaveText(
      '62 min of strength training today: protein first, and some carbs are fine.',
    )
  })

  test('on a rest day it says nothing about training', async ({ page }) => {
    await scenario(page, { today: day(2120, 120), days: weekOf(day(1900, 130)), restDay: true })
    await expect(section(page).getByRole('button', { name: 'Suggest a protein snack' })).toBeVisible()
    await expect(section(page).getByTestId('suggest-training')).toHaveCount(0)
  })
})

test.describe('in Hebrew', () => {
  test('the stop and the week read right', async ({ page }) => {
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2000, 170)) })
    await switchToHebrew(page)
    await open(page, '/today')
    await expect(weekRow(page, 'חלבון')).toHaveText('64 גרם מעל')
    await expect(stop(page)).toContainText('עדיף לעצור להיום.')
    await expect(stop(page)).toContainText('והחלבון של השבוע 75 גרם מעל היעדים: ה־11 גרם של היום יכולים לחכות.')
  })

  test('the protein snack, capped by the week', async ({ page }) => {
    await scenario(page, { today: day(2476, 134), days: weekOf(day(2000, 130)) })
    await switchToHebrew(page)
    await open(page, '/today')
    await expect(line(page)).toHaveText('326 קלוריות מעל היום · חסרים 11 גרם חלבון')
    await expect(weekRow(page, 'קלוריות')).toHaveText('124 מתחת')
    await expect(section(page).getByRole('button', { name: 'הצעה לנשנוש חלבון' })).toBeVisible()
  })
})
