import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * "Analyze automatically after taking a photo", when it is switched off.
 *
 * The setting was written by Settings, stored, exported and covered by
 * data-layer tests — and read by no screen at all. Turning it off changed
 * nothing and the photo went the instant it was taken. That is worse than a
 * dead control: it is a promise about when a picture of your food leaves the
 * device.
 */

const PHOTO = 'e2e/fixtures-meal.jpg'

test('off means the photo waits, and says it is waiting', async ({ page }) => {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'Photo analysis' }).click()
  // `click` rather than `uncheck`: the checkbox is controlled and the write is
  // async, so it holds its old state for a beat and Playwright's uncheck reads
  // that as "clicking did nothing".
  const auto = page.getByLabel(/Analyze automatically/)
  await auto.click()
  await expect(auto).not.toBeChecked()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  await open(page, '/log')
  await page.locator('input[type=file]').setInputFiles(PHOTO)

  // The photo is on screen and nothing has been sent.
  await expect(page.getByRole('img', { name: /photographed/i })).toBeVisible()
  await expect(page.getByText('Nothing has been sent yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Analyze this photo' })).toBeVisible()

  // Waiting is only worth anything if you can say something while you wait.
  await page.getByRole('button', { name: 'Add a note' }).click()
  await page.locator('#photo-note').fill('fried in a tablespoon of oil')

  await page.getByRole('button', { name: 'Analyze this photo' }).click()
  await expect(page.getByText(/kcal/).first()).toBeVisible({ timeout: 20_000 })
})

test('and "take another" throws it away without sending it', async ({ page }) => {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'Photo analysis' }).click()
  // `click` rather than `uncheck`: the checkbox is controlled and the write is
  // async, so it holds its old state for a beat and Playwright's uncheck reads
  // that as "clicking did nothing".
  const auto = page.getByLabel(/Analyze automatically/)
  await auto.click()
  await expect(auto).not.toBeChecked()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  await open(page, '/log')
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await expect(page.getByRole('button', { name: 'Analyze this photo' })).toBeVisible()

  await page.getByRole('button', { name: 'Take another' }).click()

  // Back to the camera, with nothing analysed and nothing to undo. Asserted on
  // the estimate card rather than on "kcal", which the usual-now suggestion
  // also says.
  await expect(page.getByRole('button', { name: /Take a photo/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save meal' })).toBeHidden()
})

test('on is still immediate, because that is what it says', async ({ page }) => {
  // The default. Left alone deliberately: the fix must not have quietly turned
  // the feature off for everyone who never opened Settings.
  await open(page, '/log')
  await page.locator('input[type=file]').setInputFiles(PHOTO)

  await expect(page.getByText(/kcal/).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Analyze this photo' })).toBeHidden()
})
