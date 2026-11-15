import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * A camera that does not open (2026-11-15, a tester's phone).
 *
 * On Android, "Take a photo" asks the browser for the camera directly, and a
 * browser without the camera permission does nothing: no camera, no message.
 * The app cannot see the permission, but it can see that the page never left
 * the screen. In these tests the camera never opens either (the file chooser
 * is intercepted), which is exactly the tester's situation.
 */

test('on Android, a camera that never opens is said, with the photo picker as the way on', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone project is the one with an Android browser')
  await open(page, '/log')

  const camera = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Take a photo/ }).click()
  // Asked for the camera, as before.
  expect(await (await camera).element().getAttribute('capture')).toBe('environment')

  await expect(page.getByText('The camera did not open.')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText(/Android Settings → Apps → Chrome → Permissions → Camera/)).toBeVisible()

  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose a photo instead' }).click()
  const chooser = await picker
  // The second time it asks for any photo, which needs no permission.
  expect(await chooser.element().getAttribute('capture')).toBeNull()
  await chooser.setFiles('e2e/fixtures-meal.jpg')

  await expect(page.getByRole('button', { name: /Skip/i })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('The camera did not open.')).toHaveCount(0)
})

test('a photo that arrives in time is never called a failure', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone project is the one with an Android browser')
  await open(page, '/log')
  const camera = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Take a photo/ }).click()
  await (await camera).setFiles('e2e/fixtures-meal.jpg')
  await expect(page.getByRole('button', { name: /Skip/i })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2_000)
  await expect(page.getByText('The camera did not open.')).toHaveCount(0)
})

test('on a computer, where the button opens a file window, nothing is said', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'a desktop browser')
  await open(page, '/log')
  const files = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Take a photo/ }).click()
  await files
  await page.waitForTimeout(2_500)
  await expect(page.getByText('The camera did not open.')).toHaveCount(0)
})
