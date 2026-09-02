import { expect, test } from '@playwright/test'
import { dayKey, open } from './app'

/**
 * Describing a meal in words, for a day that is not today.
 *
 * The Log screen has done this since slice 3, but it always means "now" — and
 * the meal you actually want to describe is the one you forgot, which by
 * definition was earlier. This is the same estimator and the same result card,
 * reached from whichever day the header is on.
 */

test('describes a meal in words and files it on the day on screen', async ({ page }) => {
  await open(page, '/nutrition')

  await page.getByRole('button', { name: /Previous/i }).click()
  const heading = page.locator('header p').first()
  await expect(heading).toContainText(dayKey(-1))

  await page.getByRole('button', { name: 'Add meal' }).click()

  // The sheet names its destination: "Add meal" alone would not say where.
  await expect(page.getByText(/Add meal to/)).toBeVisible()

  await page.getByRole('button', { name: 'Describe', exact: true }).click()
  await page.locator('#describe-meal').fill('a bowl of pasta with tomato sauce and parmesan')
  await page.getByRole('button', { name: 'Estimate from your words' }).click()

  // The fake estimator answers without a network call, so this is a real wait
  // on the app's own state rather than on a stub.
  const add = page.getByRole('button', { name: /^Add to / })
  await expect(add).toBeVisible({ timeout: 15_000 })

  await add.click()
  await expect(page.getByText('a bowl of pasta', { exact: false })).toHaveCount(0)

  // It landed here, on the day that was on screen.
  const total = page.locator('section').filter({ hasText: /total/i }).locator('.tabular').first()
  await expect(total).not.toHaveText('0')

  // And not on today.
  await page.getByRole('button', { name: /Next/i }).click()
  await expect(page.locator('header p').first()).toContainText(dayKey(0))
  await expect(total).toHaveText('2,130')
})
