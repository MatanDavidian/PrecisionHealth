import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * Settings — the screen that decides what every other screen means.
 *
 * A goal changes how the week is judged; the language changes the whole app.
 * Neither had coverage.
 */

test('choosing a goal changes how the week is judged', async ({ page }) => {
  await open(page, '/settings')

  const fitness = page.getByRole('button', { name: 'General fitness' })
  await fitness.click()
  await expect(fitness).toHaveAttribute('aria-pressed', 'true')

  // An untargeted goal is never scored — it says so rather than inventing one.
  await open(page, '/today?view=week')
  await expect(page.getByText(/Nothing to grade|No calorie target/i).first())
    .toBeVisible({ timeout: 15_000 })

  await open(page, '/settings')
  const loseFat = page.getByRole('button', { name: 'Lose fat, keep muscle' })
  await loseFat.click()
  await expect(loseFat).toHaveAttribute('aria-pressed', 'true')

  await open(page, '/today?view=week')
  await expect(page.getByText(/On track|kcal short|kcal off/i).first())
    .toBeVisible({ timeout: 15_000 })
})

test('the goal survives a reload, because it belongs to the person', async ({ page }) => {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'Build muscle' }).click()
  await expect(page.getByRole('button', { name: 'Build muscle' }))
    .toHaveAttribute('aria-pressed', 'true')

  await open(page, '/settings')
  await expect(page.getByRole('button', { name: 'Build muscle' }))
    .toHaveAttribute('aria-pressed', 'true')
})

test('switching language turns the whole app over, and back', async ({ page }) => {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'עברית' }).click()

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')

  // It follows you to another screen, and survives a reload.
  await open(page, '/nutrition')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'תזונה' })).toBeVisible()

  await open(page, '/settings')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})
