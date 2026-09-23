import { expect, test } from '@playwright/test'
import { dayKey, open } from './app'

/**
 * Filling a day nobody logged, from the days they did.
 *
 * The feature exists because a blank day reads as a zero, and a week graded
 * against a zero is graded against a fiction. Everything below is really a
 * test of one thing: that the number arrives AND that it never stops
 * announcing what it is.
 */

const gapsCard = (page: import('@playwright/test').Page) =>
  page.getByText(/have no meals on them|has no meals on it/)

test('the week names its blank days, and says why zero is wrong', async ({ page }) => {
  await open(page, '/today?view=week')

  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  // The sentence is the argument for the whole feature.
  await expect(page.getByText(/which is not the same as eating nothing/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Fill it from your average/ })).toBeVisible()
})

test('filling writes the day, and the week stops reading it as zero', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /Fill it from your average/ }).click()

  // The offer is replaced by its result rather than sitting beside it.
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })
  await expect(gapsCard(page)).toBeHidden()

  // And the day now carries a figure, which is the point.
  await expect(page.locator('.estimated-fill').first()).toBeVisible()
})

test('a filled day never stops saying it is an estimate', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })

  /*
    The second of the two rules, and the one a refactor is most likely to
    quietly break: the tag lives in the record's provenance, so it has to
    survive a reload rather than living in the component that wrote it.
  */
  await open(page, '/today?view=week')
  await expect(page.locator('.estimated-fill').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Estimated')).toBeVisible()
})

test('undo takes the invented day back', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Undo', exact: true }).click()

  // Back to a gap, and offered again — the day really is empty once more.
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.estimated-fill')).toHaveCount(0)
})

test('a filled day is counted, but never fed back into the average', async ({ page }) => {
  /*
    The first rule. If a filled day were evidence, filling one gap would change
    what "typical" means for the next — and a week of skipping would rewrite
    the baseline out of guesses about guesses.

    Observable from outside: fill, undo, and the offer must return identical.
    A day that had fed the average would come back different.
  */
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  const before = await gapsCard(page).textContent()

  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()

  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  expect(await gapsCard(page).textContent()).toBe(before)
})

test('the week total moves by what was filled, not by a fiction', async ({ page }) => {
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })

  // The filled day is a real figure in the week's arithmetic — that is the
  // whole reason for filling it rather than leaving the gap.
  const bars = page.locator('.estimated-fill')
  await expect(bars.first()).toBeVisible()
  const height = await bars.first().evaluate((el) => (el as HTMLElement).offsetHeight)
  expect(height).toBeGreaterThan(10)
})

test('a filled day shows its totals, marked as estimated, and no meals', async ({ page }) => {
  /*
    A filled day is a claim about how much, not about what. The numbers go in
    the day's totals — that is what filling is for — and the meal list stays
    empty, because nobody logged anything. The note on the totals is what
    stops the number passing as observed.
  */
  await open(page, '/today?view=week')
  await expect(gapsCard(page)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })

  const yesterday = dayKey(-1)
  const checks: [string, string][] = [
    [`/today?d=${yesterday}`, 'Nothing was logged on this day.'],
    [`/nutrition?d=${yesterday}`, 'Nothing logged for this day yet.'],
  ]
  for (const [path, empty] of checks) {
    await open(page, path)
    await expect(page.getByText(/these are your average day/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(empty)).toBeVisible()
    // The totals carry the average — not zero.
    await expect(page.getByText(/^1,9\d\d$|^2,0\d\d$/).first()).toBeVisible()
    // None of the foods the average was drawn from, and no meal slots.
    for (const food of ['Eggs and oats', 'Grilled chicken', 'Salmon']) {
      await expect(page.getByText(new RegExp(food))).toHaveCount(0)
    }
    for (const slot of ['Breakfast', 'Lunch', 'Dinner']) {
      await expect(page.getByText(slot, { exact: true })).toHaveCount(0)
    }
  }
  // Nobody logged anything; the count must not say otherwise.
  await expect(page.getByText('Logged (0)')).toBeVisible()

  // And the estimate can still be taken away from where it is shown.
  await page.getByRole('button', { name: 'Remove the estimate' }).click()
  await expect(page.getByText(/these are your average day/)).toHaveCount(0)
})
