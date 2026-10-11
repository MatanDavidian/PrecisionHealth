import { expect, test } from '@playwright/test'
import { open, storedRows } from './app'

/**
 * A double-tapped Save — the most natural thing a thumb does on a slow phone —
 * must log the meal once, not twice.
 */

test('tapping Save twice saves the meal once', async ({ page }) => {
  await open(page, '/log')
  const before = (await storedRows<{ id: string }>(page, 'meals')).length

  await page.setInputFiles('input[type=file]', 'e2e/fixtures-meal.jpg')
  const skip = page.getByRole('button', { name: /Skip/i })
  await expect(skip).toBeVisible({ timeout: 20_000 })
  await skip.click()

  await page.getByRole('button', { name: 'Save meal' }).dblclick()
  await expect(page.getByText(/Saved/).first()).toBeVisible({ timeout: 15_000 })

  // One new meal, however many taps reached the button.
  await expect.poll(async () => (await storedRows<{ id: string }>(page, 'meals')).length).toBe(before + 1)
})
