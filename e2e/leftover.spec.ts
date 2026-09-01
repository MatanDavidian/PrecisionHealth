import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * Recording what came back on the plate.
 *
 * The fixture's lunch has two foods, which is the case that matters: the fake
 * estimator finishes the first and leaves half the second, so a per-food
 * subtraction and a single meal-wide percentage give visibly different answers.
 * A test on a one-food meal could not tell them apart.
 */

test('subtracts each food separately and leaves the numbers needing confirmation', async ({ page }) => {
  await open(page, '/nutrition')

  const totals = page.locator('section').filter({ hasText: /total/i }).locator('.tabular').first()
  await expect(totals).toHaveText('2,130')

  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  await page.getByRole('button', { name: 'Log leftover' }).click()

  await page.getByRole('button', { name: 'Describe', exact: true }).click()
  await page.locator('#leftover-describe').fill('finished the chicken, half the rice came back')
  await page.getByRole('button', { name: 'Estimate leftover' }).click()

  // The headline is weighted by calories, not an average of the fractions.
  await expect(page.getByText(/of this meal was eaten/)).toBeVisible({ timeout: 15_000 })

  // Per food, which is the whole point: one finished, one half left.
  await expect(page.getByText('100%')).toBeVisible()
  await expect(page.getByText('50%')).toBeVisible()

  await page.getByRole('button', { name: 'Apply to this meal' }).click()

  // The day total came down, and the editor closed.
  await expect(page.getByRole('button', { name: 'Log leftover' })).toHaveCount(0)
  await expect(totals).not.toHaveText('2,130')

  // The reduced food is a model's claim, not one the person vouched for, so it
  // asks to be confirmed.
  await expect(page.getByRole('button', { name: 'Confirm' }).first()).toBeVisible()
})

test('says so plainly when nothing came back', async ({ page }) => {
  await open(page, '/nutrition')
  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  await page.getByRole('button', { name: 'Log leftover' }).click()
  await page.getByRole('button', { name: 'Describe', exact: true }).click()
  await page.locator('#leftover-describe').fill('nothing left, the plate is empty')
  await page.getByRole('button', { name: 'Estimate leftover' }).click()

  await expect(page.getByText('Nothing came back — this meal is unchanged.')).toBeVisible({
    timeout: 15_000,
  })
  // Nothing to apply, so no button offering to.
  await expect(page.getByRole('button', { name: 'Apply to this meal' })).toHaveCount(0)
})
