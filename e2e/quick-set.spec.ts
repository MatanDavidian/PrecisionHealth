import { expect, test, type Page } from '@playwright/test'
import { dayKey, NOW, open, pinTime, storedRows, switchToHebrew } from './app'

/**
 * Quick-set a day (features/quick-set-a-day.md): less (−15%), average, more
 * (+15%) or a number, in the week's gaps card, on the Day tab and in the
 * Nutrition tab. Whatever is chosen, the day stays an estimate.
 */

interface MealRow {
  day: string
  mealId: string
  version: number
  data: {
    retracted?: boolean
    provenance: { source: string }
    fillChoice?: string
    items: { nutrients: { energy: { value: number } } }[]
  }
}

/**
 * The filled days as they stand: the newest version of each, unless that
 * version takes it back. Records are never deleted (D4); Undo appends a
 * retraction.
 */
async function filled(page: Page) {
  const rows = (await storedRows<MealRow>(page, 'meals')).filter((row) => row.data.provenance.source === 'PATTERN_FILL')
  const newest = new Map<string, MealRow>()
  for (const row of rows) if ((newest.get(row.mealId)?.version ?? 0) < row.version) newest.set(row.mealId, row)
  return [...newest.values()].filter((row) => !row.data.retracted)
}

/** The average the card offers, read from its own Average button ("1,920 kcal"). */
async function averageKcal(page: Page): Promise<number> {
  const text = await page.getByRole('button', { name: /^Average/ }).first().innerText()
  return Number(text.replace(/[^\d]/g, ''))
}

async function blankDays(page: Page, match: (day: string) => boolean) {
  await open(page, '/today?view=week')
  await expect(page.getByRole('heading', { name: /This week/ })).toBeVisible({ timeout: 15_000 })
  const ids = (await storedRows<{ id: string; day: string }>(page, 'meals')).filter((row) => match(row.day)).map((row) => row.id)
  await page.evaluate(async (ids) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('timeline-health')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction('meals', 'readwrite')
    for (const id of ids) tx.objectStore('meals').delete(id)
    await new Promise((resolve) => (tx.oncomplete = resolve))
    db.close()
  }, ids)
}

test('the week: "less" fills 15% under the average, and says so', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(page.getByText(/How much did you eat on those days/)).toBeVisible({ timeout: 15_000 })
  const average = await averageKcal(page)

  await page.getByRole('button', { name: /^Less/ }).click()
  const less = Math.round(average * 0.85)
  await page.getByRole('button', { name: `Fill it: ${less.toLocaleString('en-US')} kcal` }).click()
  await expect(page.getByText(`Day set: ${less.toLocaleString('en-US')} kcal.`)).toBeVisible({ timeout: 15_000 })

  const [row] = await filled(page)
  expect(row.data.fillChoice).toBe('LESS')
  // The average is rounded for the button; the record is the exact 85%, within a calorie.
  expect(Math.abs(row.data.items[0].nutrients.energy.value - average * 0.85)).toBeLessThan(2)
})

test('the week: a number of your own', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(page.getByText(/How much did you eat on those days/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^A number/ }).click()
  await page.getByLabel('Calories, roughly').fill('1500')
  await expect(page.getByText(/follow your usual mix/)).toBeVisible()
  await page.getByRole('button', { name: 'Fill it: 1,500 kcal' }).click()
  await expect(page.getByText('Day set: 1,500 kcal.')).toBeVisible({ timeout: 15_000 })
  const [row] = await filled(page)
  expect(row.data.fillChoice).toBe('NUMBER')
  expect(row.data.items[0].nutrients.energy.value).toBe(1500)
})

test('the week: average is still one tap, worded as before', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(page.getByRole('button', { name: /^Average/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Fill it from your average' }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })
  const [row] = await filled(page)
  expect(row.data.fillChoice).toBeUndefined()
})

test('the Day tab: a past empty day can be set, and taken back', async ({ page }) => {
  const day = dayKey(-1)
  await blankDays(page, (d) => d === day)
  await open(page, `/today?d=${day}`)
  await expect(page.getByRole('heading', { name: 'Nothing logged on this day' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /^More/ }).click()
  await page.getByRole('button', { name: /^Set this day: [\d,]+ kcal$/ }).click()
  await expect(page.getByText(/^Day set: [\d,]+ kcal\.$/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Nothing logged on this day' })).toHaveCount(0)
  expect((await filled(page)).map((row) => row.data.fillChoice)).toEqual(['MORE'])

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Nothing logged on this day' })).toBeVisible({ timeout: 15_000 })
  expect(await filled(page)).toHaveLength(0)
})

test('the Day tab: today is not offered before 16:00, only in the evening', async ({ page }) => {
  const today = dayKey(0)
  await blankDays(page, (d) => d === today)
  // NOW is midday: a day in progress, not a gap.
  await open(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Nothing logged today' })).toHaveCount(0)
})

test('the Day tab: today in the evening, with nothing logged', async ({ page }) => {
  const evening = new Date(NOW)
  evening.setHours(22, 30, 0, 0)
  await pinTime(page, evening)
  const today = dayKey(0)
  await blankDays(page, (d) => d === today)
  await open(page, '/today')
  await expect(page.getByRole('heading', { name: 'Nothing logged today' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Log meals instead' })).toBeVisible()
  await page.getByRole('button', { name: /^Set today: [\d,]+ kcal$/ }).click()
  await expect(page.getByText(/^Set from your average: [\d,]+ kcal\.$/)).toBeVisible({ timeout: 15_000 })
})

test('the number field fits a phone-width card', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const day = dayKey(-1)
  await blankDays(page, (d) => d === day)
  await open(page, `/today?d=${day}`)
  await expect(page.getByRole('heading', { name: 'Nothing logged on this day' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^A number/ }).click()
  await expect(page.getByRole('button', { name: /^A number/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /^Average/ })).toHaveAttribute('aria-pressed', 'false')
  const card = await page.getByRole('region', { name: 'Nothing logged on this day' }).boundingBox()
  const plus = await page.getByRole('button', { name: '100 kcal more' }).boundingBox()
  expect(plus!.x + plus!.width).toBeLessThanOrEqual(card!.x + card!.width)
})

test('the Nutrition tab: adding meals stays first, setting the day is there too', async ({ page }) => {
  const day = dayKey(-1)
  await blankDays(page, (d) => d === day)
  await open(page, `/nutrition?d=${day}`)
  await expect(page.getByRole('heading', { name: 'No meals on this day' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('or set the day', { exact: true })).toBeVisible()
  // One plain "Add meal" on the screen (the list's own); the card's names the day.
  await expect(page.getByRole('button', { name: 'Add meal', exact: true })).toHaveCount(1)

  // Choosing to add meals opens the sheet, and the card steps aside until it is closed.
  await page.getByRole('button', { name: /^Add meal to yesterday$/i }).click()
  await expect(page.getByText(/^Add meal to yesterday$/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No meals on this day' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add meal', exact: true }).click() // the list's own toggle closes the sheet
  await expect(page.getByRole('heading', { name: 'No meals on this day' })).toBeVisible()

  await page.getByRole('button', { name: /^Set this day: [\d,]+ kcal$/ }).click()
  await expect(page.getByRole('heading', { name: 'No meals on this day' })).toHaveCount(0, { timeout: 15_000 })
  expect(await filled(page)).toHaveLength(1)
})

test('in Hebrew the choices read right to left', async ({ page }) => {
  await switchToHebrew(page)
  await open(page, '/today?view=week')
  await expect(page.getByText('כמה אכלתם בימים האלה?')).toBeVisible({ timeout: 15_000 })
  for (const name of ['פחות', 'ממוצע', 'יותר', 'מספר']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  await expect(page.locator('html[dir="rtl"]')).toHaveCount(1)
})
