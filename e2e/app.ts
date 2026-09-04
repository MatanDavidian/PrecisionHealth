import type { Page } from '@playwright/test'

/**
 * The app with deterministic data and no network.
 *
 * `?fake=1` swaps the estimator and seeds a fixed day, which is what makes
 * these tests worth running at all: the numbers below are asserted exactly, and
 * they can only be asserted exactly because nothing here talks to Supabase or
 * OpenAI.
 */
export const open = async (page: Page, path: string) => {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}fake=1`)
  await page.waitForLoadState('networkidle')
}

/**
 * Switch the app to Hebrew, through the UI.
 *
 * Deliberately not by seeding storage. The language is persisted in IndexedDB
 * by the settings repository, and an earlier attempt to fake it by writing
 * `localStorage.lang` silently did nothing — the tests went green while running
 * in English the whole time. Clicking the control is slower and cannot lie.
 */
export async function switchToHebrew(page: Page) {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'עברית' }).click()
  await page.locator('html[dir="rtl"]').waitFor()
}

/**
 * Where an element sits on the page, independent of scroll.
 *
 * Viewport coordinates would let a test pass because the page happened to
 * scroll by exactly the amount an element moved. That is not a hypothetical:
 * the first version of this check measured `getBoundingClientRect()` alone and
 * reported a control as stable at `y=0` while it was in fact being pushed off
 * the top of the screen.
 */
export const documentBox = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const box = el.getBoundingClientRect()
    return {
      x: Math.round(box.x + window.scrollX),
      y: Math.round(box.y + window.scrollY),
      width: Math.round(box.width),
    }
  })

/**
 * A calendar date relative to today, as the app writes it.
 *
 * Dates are derived rather than written down. A spec with `2026-08-31` in it
 * passes on the day it was written and fails the next morning — which is
 * exactly what happened here, and it makes the suite look broken when the code
 * is fine.
 */
export const dayKey = (offset = 0): string => {
  const at = new Date()
  at.setDate(at.getDate() + offset)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

/**
 * A number read from the page once it has stopped changing.
 *
 * Changing the day refetches without unmounting, so the totals card keeps
 * showing the PREVIOUS day for a moment after the heading has already switched.
 * Reading once caught that stale value and looked exactly like the app writing
 * to the wrong day — the assertion failed with a number that was real, just a
 * day old.
 *
 * Two equal reads in a row is a weak guarantee, but it is the honest one
 * available without the app exposing a "loading" flag for a day change.
 */
export async function settledNumber(
  locator: import('@playwright/test').Locator,
  timeoutMs = 10_000,
): Promise<number> {
  const read = async () => Number(((await locator.textContent()) ?? '').replace(/[^\d.-]/g, ''))
  const deadline = Date.now() + timeoutMs
  let previous = await read()
  while (Date.now() < deadline) {
    await locator.page().waitForTimeout(150)
    const current = await read()
    if (current === previous && Number.isFinite(current)) return current
    previous = current
  }
  return previous
}
