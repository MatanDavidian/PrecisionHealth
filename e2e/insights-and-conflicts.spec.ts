import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * Week insights, and a disagreement between two sources.
 *
 * Insights is the one place health data deliberately leaves the device, so the
 * promise attached to the button matters as much as the answer. Conflicts are
 * D6 made visible: the app surfaces disagreements rather than resolving them.
 */

test('nothing is sent until you ask, and the answer says how sure it is', async ({ page }) => {
  await open(page, '/today?view=week')

  const ask = page.getByRole('button', { name: /Ask for insights/i })
  await expect(ask).toBeVisible({ timeout: 15_000 })

  /*
    The promise, before the request. It is specific — a count of meals — rather
    than "some data", because a person agreeing to share a week of their eating
    should be able to see the size of what they are agreeing to.
  */
  await expect(page.getByText(/Sends \d+ meals?/i)).toBeVisible()
  await expect(page.getByText(/No name, no account/i)).toBeVisible()

  await ask.click()

  await expect(page.getByText(/WHAT IS IN THE DATA/i)).toBeVisible({ timeout: 20_000 })
  // Confidence is shown rather than implied, and a thin week says so.
  await expect(page.getByText(/\d+% sure/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Ask again/i })).toBeVisible()
})

test('two sources disagreeing is surfaced, not silently resolved', async ({ page }) => {
  await open(page, '/today')

  /*
    D6. The fixture seeds a scale and a phone 900 g apart — past the 200 g
    tolerance — so the app must show both and say which it is using, rather
    than averaging them or picking one quietly.
  */
  await expect(page.getByText(/Two sources disagree/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Showing .* until you confirm one/i)).toBeVisible()

  const scale = page.getByRole('button', { name: /Scale/ })
  const phone = page.getByRole('button', { name: /Apple Health/ })
  await expect(scale).toBeVisible()
  await expect(phone).toBeVisible()

  // Choosing settles it, and the notice goes.
  await phone.click()
  await expect(page.getByText(/Two sources disagree/i)).toHaveCount(0, { timeout: 10_000 })
})
