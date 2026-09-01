import { expect, test, type Page } from '@playwright/test'
import { open } from './app'

/**
 * A meal typed in for a day that is not today.
 *
 * The failure this guards against was silent: the form built its instant from
 * `new Date()` and carried only the typed clock time, so a meal entered while
 * looking at last Tuesday was filed under today. Nothing errored, nothing
 * looked wrong on the screen you were on — the calories simply landed on the
 * wrong day. The only way to see it is to add a meal on one day and then go and
 * look at another.
 */

const caloriesOn = (page: Page) =>
  page.locator('section').filter({ hasText: "Today's total" }).locator('.tabular').first().textContent()

const stepDays = async (page: Page, direction: 'Previous' | 'Next', times: number) => {
  for (let i = 0; i < times; i++) {
    await page.getByRole('button', { name: new RegExp(direction, 'i') }).click()
    await page.waitForTimeout(150)
  }
}

test('lands on the day it was typed for, and nowhere else', async ({ page }) => {
  await open(page, '/nutrition')
  const todayBefore = await caloriesOn(page)
  expect(todayBefore).toBe('2,130')

  await stepDays(page, 'Previous', 2)
  const pastBefore = await caloriesOn(page)
  expect(pastBefore, 'the seeded fixture should leave this day empty').toBe('0')

  // Manual entry used to be locked to today. It is reachable here now.
  await page.getByRole('button', { name: 'By hand' }).click()
  const form = page.locator('form')
  await form.getByLabel('Time').fill('07:30')
  await form.getByLabel('Food').fill('Backfilled porridge')
  await form.getByLabel('Grams').fill('300')
  await form.getByLabel('kcal').fill('450')
  await form.getByRole('button', { name: 'Save meal' }).click()

  await expect(page.getByText('Backfilled porridge')).toBeVisible()
  expect(await caloriesOn(page), 'the past day did not take the meal').toBe('450')

  await stepDays(page, 'Next', 2)
  expect(await caloriesOn(page), 'the meal leaked onto today').toBe('2,130')
  await expect(page.getByText('Backfilled porridge')).toHaveCount(0)
})
