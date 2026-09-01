import { expect, test } from '@playwright/test'
import { documentBox, open, switchToHebrew } from './app'

/**
 * A control may not move when you use it.
 *
 * Two of them did, and both were reported as the page "changing" rather than as
 * a layout bug — which is what it feels like when the thing under your finger
 * relocates. The Day/Week switch shared a row with the date stepper, which
 * exists only in the day view, so the row's contents changed width with the
 * view: 209px across and 54px up on a phone, 240px sideways on a desktop. The
 * Settings tabs sat under a subtitle that changes per tab, and in Hebrew some
 * of those wrap to two lines, stepping the row 20px down and back.
 *
 * Neither is visible to a unit test, and neither leaves a trace in the DOM —
 * the markup is identical either way. Only a real layout can answer it.
 */

test('the day/week switch does not move when you use it', async ({ page }) => {
  await open(page, '/today')

  const day = page.getByRole('button', { name: 'Day', exact: true })
  const week = page.getByRole('button', { name: 'Week', exact: true })
  const where = () => documentBox(page, 'header [aria-pressed]')

  const inDayView = await where()

  await week.click()
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible()
  expect(await where(), 'moved when switching to the week').toEqual(inDayView)

  await day.click()
  await expect(week).toBeVisible()
  expect(await where(), 'moved on the way back').toEqual(inDayView)
})

test('the settings tabs do not move as you move along them', async ({ page }) => {
  await open(page, '/settings')

  const tabs = page.locator('nav:has(button[aria-current])')
  const where = () => documentBox(page, 'nav:has(button[aria-current])')
  const start = await where()

  // Every tab, and back to the first — the subtitle above them is a different
  // length for each, which is what used to push them down.
  for (const index of [1, 2, 0]) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await tabs.locator('button').nth(index).click()
    await expect(tabs.locator('button').nth(index)).toHaveAttribute('aria-current', 'page')
    expect(await where(), `moved after selecting tab ${index}`).toEqual(start)
  }
})

test('neither moves in Hebrew, where the subtitles wrap differently', async ({ page }) => {
  await switchToHebrew(page)

  const tabs = page.locator('nav:has(button[aria-current])')
  const where = () => documentBox(page, 'nav:has(button[aria-current])')
  const start = await where()
  for (const index of [1, 2, 0]) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await tabs.locator('button').nth(index).click()
    expect(await where(), `settings tabs moved in Hebrew on tab ${index}`).toEqual(start)
  }

  await open(page, '/today')
  const switchAt = () => documentBox(page, 'header [aria-pressed]')
  const before = await switchAt()
  await page.locator('header [aria-pressed]').nth(1).click()
  await expect(page.getByRole('heading', { name: 'השבוע' })).toBeVisible()
  expect(await switchAt(), 'day/week switch moved in Hebrew').toEqual(before)
})
