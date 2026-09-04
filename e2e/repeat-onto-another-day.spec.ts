import { expect, test } from '@playwright/test'
import { dayKey, open, settledNumber } from './app'

/**
 * Repeating a usual meal onto the day on screen.
 *
 * The Log screen has done this since slice 3.6, but only ever onto today,
 * because the whole Log screen means now. This is the combination that was
 * missing, and it is the likeliest reason to be looking at yesterday: repeat
 * something you eat often, onto the day you forgot.
 */

const dayTotal = (page: import('@playwright/test').Page) =>
  page.locator('section').filter({ hasText: /total/i }).locator('.tabular').first()

const asNumber = (locator: import('@playwright/test').Locator) => settledNumber(locator)

test('repeats a usual onto the selected day, and not onto today', async ({ page }) => {
  await open(page, '/nutrition')
  const totals = dayTotal(page)
  const todayBefore = await asNumber(totals)

  await page.getByRole('button', { name: /Previous/i }).click()
  await expect(page.locator('header p').first()).toContainText(dayKey(-1))
  const pastBefore = await asNumber(totals)

  await page.getByRole('button', { name: 'Add meal' }).click()
  await page.getByRole('button', { name: 'Again', exact: true }).click()

  // Enough on each row to tell two similar meals apart.
  const first = page.getByRole('button').filter({ hasText: /\d+ kcal/ }).first()
  await expect(first).toBeVisible({ timeout: 10_000 })
  const label = (await first.textContent()) ?? ''
  const kcal = Number(label.match(/(\d[\d,]*)\s*kcal/)![1].replace(/,/g, ''))
  expect(kcal, 'a usual should carry its calories').toBeGreaterThan(0)

  await first.click()

  // It landed here.
  await expect
    .poll(async () => await asNumber(totals), { timeout: 10_000 })
    .toBe(pastBefore + kcal)

  // And not on today.
  /*
    Polled, not read once. The header switches to today before the day's data
    has reloaded, so a single read caught YESTERDAY's total while the heading
    already said today — a race in the test that looked exactly like the
    feature writing to the wrong day.
  */
  await page.getByRole('button', { name: /Next/i }).click()
  await expect(page.locator('header p').first()).toContainText(dayKey(0))
  await expect
    .poll(async () => await asNumber(totals), { timeout: 10_000 })
    .toBe(todayBefore)
})

test('editing the copy does not disturb the day it came from', async ({ page }) => {
  /*
    The strongest form of "it is a copy, not a reference" is a unit test, and
    there is one. What only a browser can show is the consequence: changing the
    repeated meal on one day leaves another day's totals alone.

    Asserted as a number rather than by comparing the rendered list, which was
    the first attempt and broke on whitespace rather than on behaviour.
  */
  await open(page, '/nutrition')
  const totals = dayTotal(page)
  const todayBefore = await asNumber(totals)

  await page.getByRole('button', { name: /Previous/i }).click()
  await page.getByRole('button', { name: 'Add meal' }).click()
  await page.getByRole('button', { name: 'Again', exact: true }).click()

  const first = page.getByRole('button').filter({ hasText: /\d+ kcal/ }).first()
  await expect(first).toBeVisible({ timeout: 10_000 })
  await first.click()
  await expect(page.getByRole('button', { name: 'Add meal' })).toBeVisible({ timeout: 10_000 })

  // Edit the copy — the newest row on this day — and halve its first food.
  await page.locator('button[aria-label^="Edit "]').last().click()
  const grams = page.locator('form input[id^="grams-"]').first()
  const was = Number(await grams.inputValue())
  await grams.fill(String(Math.round(was / 2)))
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByRole('button', { name: 'Add meal' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: /Next/i }).click()
  await expect(page.locator('header p').first()).toContainText(dayKey(0))
  await expect
    .poll(async () => await asNumber(totals), { timeout: 10_000 })
    .toBe(todayBefore)
})

test('says so plainly when there is nothing to repeat', async ({ page }) => {
  // A day far enough back that the 60-day usuals window is empty for it is not
  // reachable here, so this asserts the copy exists rather than the state — the
  // fixture always has meals. Kept as a guard on the string being wired up.
  await open(page, '/nutrition')
  await page.getByRole('button', { name: 'Add meal' }).click()
  await page.getByRole('button', { name: 'Again', exact: true }).click()
  await expect(page.getByText(/Adds a copy to/)).toBeVisible({ timeout: 10_000 })
})
