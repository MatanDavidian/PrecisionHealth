import { expect, test } from '@playwright/test'
import { documentBox, open } from './app'

/**
 * Calendar weeks, and moving between them.
 *
 * The week is Sunday to Saturday rather than the seven days ending today, and
 * the reason is insights rather than tidiness: a rolling window cannot own one,
 * because the set of days it describes moves every morning. A calendar week is
 * a stable, nameable thing — which is also what makes "previous week" mean
 * anything.
 */

test('shows the week the selected day falls in, and keeps the day', async ({ page }) => {
  await open(page, '/today')

  // Step back four days, so the selected day is very unlikely to be today.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Previous/i }).click()
  const selectedDay = await page.locator('header p').first().textContent()

  await page.getByRole('button', { name: 'Week', exact: true }).click()

  // Either heading is correct — "This week" only when it really is this week.
  await expect(page.getByRole('heading', { name: /^(This week|Week of )/ })).toBeVisible()
  await expect(page.locator('header p').first(), 'the week names a range').toContainText('–')

  /*
    The point of the feature: the two views agree about what you are looking
    at. Before this, switching to the week always showed the last seven days
    regardless of the day on screen, and switching back could land you
    somewhere else entirely.
  */
  await page.getByRole('button', { name: 'Day', exact: true }).click()
  await expect(page.locator('header p').first()).toHaveText(selectedDay!)
})

test('steps whole weeks, and the switch does not move while it does', async ({ page }) => {
  await open(page, '/today')
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'This week', exact: true })).toBeVisible()

  const where = () => documentBox(page, 'header [aria-pressed]')
  const atStart = await where()

  /*
    Located structurally, not by its text. Filtering on the label and then
    asserting the label changed cannot work — the locator goes stale the moment
    it succeeds. The arrows carry aria-label and the Day/Week pills carry
    aria-pressed, so the week label is the button with neither.
  */
  const label = page.locator('header button:not([aria-pressed]):not([aria-label])').first()
  await expect(label).toHaveText('This week')

  await page.getByRole('button', { name: 'Previous week' }).click()
  // Once you leave the current week the label names the range instead.
  await expect(label).not.toHaveText('This week')
  expect(await where(), 'the Day/Week switch moved while paging weeks').toEqual(atStart)

  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(label).toHaveText('This week')
  expect(await where()).toEqual(atStart)
})

test('will not step into a week that has not happened', async ({ page }) => {
  await open(page, '/today')
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'This week', exact: true })).toBeVisible()

  // Disabled rather than hidden, so the control does not jump as you navigate.
  await expect(page.getByRole('button', { name: 'Next week' })).toBeDisabled()
})
