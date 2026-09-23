import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { dayKey, open, settledNumber } from './app'

/**
 * A filled day is a total, never a meal — everywhere, not only on one screen.
 *
 * fill-the-gaps.spec.ts checks the fill itself and the two day screens. This
 * file checks the places that were NOT written with filling in mind and read
 * meals anyway: the store, the Log tab's repeat shortcuts, a real meal logged
 * over the estimate, the insights consent line, and the export. Each of them
 * is somewhere an estimate could quietly pass for something eaten.
 *
 * The demo data leaves yesterday blank, so yesterday is the day that gets
 * filled throughout.
 */

const GAP = dayKey(-1)
const ESTIMATE_NAME = 'Estimated day (average of logged days)'

interface StoredMeal {
  day: string
  data: {
    slot: string
    provenance: { source: string }
    retracted?: boolean
    items: {
      name: string
      amount: { value: number }
      nutrients: Record<'energy' | 'protein' | 'carbs' | 'fat', { value: number }>
      provenance: { source: string }
    }[]
  }
}

/** Every row in the meals store, read straight from IndexedDB — not through the app. */
const storedMeals = (page: Page): Promise<StoredMeal[]> =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('timeline-health')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows: StoredMeal[] = await new Promise((resolve) => {
      const request = db.transaction('meals').objectStore('meals').getAll()
      request.onsuccess = () => resolve(request.result)
    })
    db.close()
    return rows
  })

async function fillTheGap(page: Page) {
  await open(page, '/today?view=week')
  const fill = page.getByRole('button', { name: /Fill it from your average/ })
  await expect(fill).toBeVisible({ timeout: 15_000 })
  await fill.click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })
}

const dayCalories = (page: Page) =>
  settledNumber(page.locator('section').filter({ hasText: /total/i }).locator('.tabular').first())

const estimateNote = (page: Page) => page.getByText(/these are your average day/)

test('the store gains one record for the day: the four totals, and no food', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(page.getByRole('button', { name: /Fill it from your average/ })).toBeVisible({
    timeout: 15_000,
  })
  const before = await storedMeals(page)
  expect(before.filter((row) => row.day === GAP), 'the gap day starts empty').toHaveLength(0)

  await fillTheGap(page)

  const after = await storedMeals(page)
  const added = after.filter((row) => !before.some((b) => JSON.stringify(b) === JSON.stringify(row)))
  expect(added, 'exactly one record written, not one per meal').toHaveLength(1)

  const [record] = added
  expect(record.day).toBe(GAP)
  expect(record.data.provenance.source).toBe('PATTERN_FILL')
  expect(record.data.items).toHaveLength(1)

  const [item] = record.data.items
  expect(item.name).toBe(ESTIMATE_NAME)
  // A day weighs nothing; any grams here would be invented.
  expect(item.amount.value).toBe(0)
  // Tagged on the item as well, because some readers only ever see items.
  expect(item.provenance.source).toBe('PATTERN_FILL')
  for (const nutrient of ['energy', 'protein', 'carbs', 'fat'] as const) {
    expect(item.nutrients[nutrient].value, nutrient).toBeGreaterThan(0)
  }

  // And what the day screen shows is exactly what was stored.
  await open(page, `/nutrition?d=${GAP}`)
  await expect(estimateNote(page)).toBeVisible({ timeout: 15_000 })
  expect(await dayCalories(page)).toBe(item.nutrients.energy.value)
})

test('the Log tab never offers the estimate as something to eat again', async ({ page }) => {
  /*
    The Again tab lists what you have eaten before, and shows yesterday as a
    ready-made "Repeat the day". Yesterday is the filled day — so this is the
    shortcut most likely to present the average as a meal.
  */
  await fillTheGap(page)

  await open(page, '/log?mode=again')
  // Wait for the list itself, so the absences below are real and not early.
  await expect(page.getByRole('button', { name: /Eggs and oats/ }).first()).toBeVisible({
    timeout: 15_000,
  })

  await expect(page.getByText(/Estimated day/)).toHaveCount(0)
  await expect(page.getByText('Yesterday', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Repeat the day|Repeat so far/ })).toHaveCount(0)
})

test('a real meal logged on the filled day replaces the estimate, and deleting it brings it back', async ({
  page,
}) => {
  await fillTheGap(page)

  await open(page, `/nutrition?d=${GAP}`)
  await expect(estimateNote(page)).toBeVisible({ timeout: 15_000 })
  const estimated = await dayCalories(page)

  // Log a real meal onto the filled day, through the same screen a person would.
  await page.getByRole('button', { name: 'Add meal' }).click()
  await page.getByRole('button', { name: 'Again', exact: true }).click()
  const usual = page.getByRole('button').filter({ hasText: /\d+ kcal/ }).first()
  await expect(usual).toBeVisible({ timeout: 10_000 })
  const kcal = Number(((await usual.textContent()) ?? '').match(/(\d[\d,]*)\s*kcal/)![1].replace(/,/g, ''))
  await usual.click()

  // The day is now what was logged — not the estimate plus the meal.
  await expect.poll(() => dayCalories(page), { timeout: 10_000 }).toBe(kcal)
  await expect(estimateNote(page)).toHaveCount(0)
  await expect(page.getByText('Logged (1)')).toBeVisible()

  // Take the meal away again and the day falls back to its estimate, not to zero.
  await page.getByRole('button', { name: /^Delete / }).first().click()
  await expect.poll(() => dayCalories(page), { timeout: 10_000 }).toBe(estimated)
  await expect(estimateNote(page)).toBeVisible()
  await expect(page.getByText('Logged (0)')).toBeVisible()
})

test('the insights consent line counts meals, and an estimate is not one', async ({ page }) => {
  /*
    "Sends N meals" is a promise about the size of what leaves the device. The
    estimate's numbers travel under "your totals"; counting it as a meal would
    promise the model a meal nobody ate.
  */
  await open(page, '/today?view=week')
  const promise = page.getByText(/Sends \d+ meals?/)
  await expect(promise).toBeVisible({ timeout: 15_000 })
  const before = await promise.textContent()

  const fill = page.getByRole('button', { name: /Fill it from your average/ })
  await fill.click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })
  // The week re-reads after the fill; let the chart show it before comparing.
  await expect(page.locator('.estimated-fill').first()).toBeVisible()

  await expect(promise).toHaveText(before!)
})

test('the export carries the estimate as an estimate, and nothing that looks eaten', async ({
  page,
}) => {
  await fillTheGap(page)

  await open(page, '/settings')
  await page.getByRole('button', { name: 'Account & data' }).click()
  const waiting = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download my data' }).click()
  const download = await waiting
  const body = JSON.parse(await readFile((await download.path())!, 'utf-8')) as {
    meals: StoredMeal['data'][]
  }

  const filled = body.meals.filter((meal) => meal.provenance.source === 'PATTERN_FILL')
  expect(filled, 'one estimate in the file').toHaveLength(1)
  expect(filled[0].items.map((item) => item.name)).toEqual([ESTIMATE_NAME])
  expect(filled[0].items[0].provenance.source).toBe('PATTERN_FILL')

  // Nothing else in the file claims to be an estimate named like food.
  const estimateItems = body.meals.flatMap((meal) =>
    meal.items.filter((item) => item.provenance.source === 'PATTERN_FILL'),
  )
  expect(estimateItems.map((item) => item.name)).toEqual([ESTIMATE_NAME])
})
