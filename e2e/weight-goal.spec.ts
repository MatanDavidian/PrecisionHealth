import { expect, test, type Page } from '@playwright/test'
import { open } from './app'

/**
 * The target weight — the one figure in Settings that is a goal rather than a
 * reading, and the one that had no coverage at all.
 *
 * Two bugs lived here. The screen showed a target nobody had set, because the
 * stepper falls back to the current weight and never said it was doing so. And
 * every target was written as REACH — "land exactly on this number" — which,
 * against canonical grams, is a goal that cannot be met.
 */

const target = (page: Page) => page.getByRole('spinbutton', { name: 'Target' })
const current = (page: Page) => page.getByRole('spinbutton', { name: 'Current' })

/**
 * The weight goal as it was actually persisted.
 *
 * `direction` is drawn nowhere: it decides whether the goal can ever be met,
 * and the screen looks identical either way. A test that only read the screen
 * would have watched the second bug go straight past, so this one opens the
 * store the app writes to.
 */
async function storedWeightGoal(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('timeline-health')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows = await new Promise<{ data: unknown }[]>((resolve, reject) => {
      const request = db.transaction('goals').objectStore('goals').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    const weight = rows
      .map((row) => row.data as { metric: string; direction: string; target: { value: number } })
      .filter((goal) => goal.metric === 'WEIGHT')
    // Goals are append-only (D4), so the last one written is the one in force.
    return weight.at(-1)
  })
}

/** The weight the fixture actually holds, read rather than written down. */
async function settledWeight(page: Page): Promise<number> {
  await expect(page.getByText(/Last recorded/)).toBeVisible()
  return Number(await current(page).inputValue())
}

test('a target nobody has set says so, instead of showing one', async ({ page }) => {
  await open(page, '/settings')

  // The fixture carries no weight goal. The stepper still needs a number to be
  // nudged from, so the number has to admit what it is.
  await expect(target(page)).toBeVisible()
  await expect(page.getByText(/No target set yet/i)).toBeVisible()
  expect(await storedWeightGoal(page)).toBeUndefined()
})

test('setting a target records which way it points, so it can be met', async ({ page }) => {
  await open(page, '/settings')
  const weight = await settledWeight(page)

  // Below where you stand is a ceiling: arriving there should read as arrived,
  // not as overshoot. It was written as REACH, which asked for the exact gram.
  await target(page).fill(String(weight - 4))
  await expect(page.getByText(/No target set yet/i)).toBeHidden()
  await expect
    .poll(async () => (await storedWeightGoal(page))?.direction, { timeout: 10_000 })
    .toBe('AT_MOST')

  // Above it is a floor. Nobody states this when they name a target weight, so
  // it is worked out from where they are.
  await target(page).fill(String(weight + 4))
  await expect
    .poll(async () => (await storedWeightGoal(page))?.direction, { timeout: 10_000 })
    .toBe('AT_LEAST')

  // Stored canonically (D8): kilograms go in, grams come out.
  const stored = await storedWeightGoal(page)
  expect(stored?.target.value).toBeCloseTo((weight + 4) * 1000, 0)
})

test('the gap is counted the way you would count it', async ({ page }) => {
  await open(page, '/settings')
  const weight = await settledWeight(page)

  await target(page).fill(String(weight - 3))
  await expect(page.getByText('3 kg to lose')).toBeVisible()

  await target(page).fill(String(weight + 2))
  await expect(page.getByText('2 kg to gain')).toBeVisible()

  await target(page).fill(String(weight))
  await expect(page.getByText('You are there.')).toBeVisible()
})

test('a target belongs to the person, so it survives a reload', async ({ page }) => {
  await open(page, '/settings')
  await settledWeight(page)
  await target(page).fill('68')
  await expect(page.getByText(/kg to lose/)).toBeVisible()

  await open(page, '/settings')
  await expect(target(page)).toHaveValue('68.0')
  await expect(page.getByText(/No target set yet/i)).toBeHidden()
})

test('only a programme that is about the scale asks for a target', async ({ page }) => {
  await open(page, '/settings')
  await expect(target(page)).toBeVisible()

  // Holding steady has no number to aim at, and general fitness is not about
  // weight at all.
  await page.getByRole('button', { name: 'Keep this weight' }).click()
  await expect(target(page)).toBeHidden()

  await page.getByRole('button', { name: 'General fitness' }).click()
  await expect(target(page)).toBeHidden()

  await page.getByRole('button', { name: 'Build muscle' }).click()
  await expect(target(page)).toBeVisible()

  // Current weight is a fact about you rather than about the programme: it stays.
  await expect(current(page)).toBeVisible()
})
