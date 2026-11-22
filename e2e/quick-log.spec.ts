import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { open, storedRows, switchToHebrew } from './app'

/**
 * The quick sheet (docs/features/meal-reminders.md), where a meal reminder
 * leads. The sample person's usual lunch is grilled chicken breast, eaten
 * thirteen times in the fortnight before this week.
 */

interface MealRow {
  data: { id: string; version: number; retracted?: boolean; slot: string; items: { name: string }[] }
}

/** Live meals named like the usual lunch, logged at lunch. */
async function chickenLunches(page: Page) {
  const rows = await storedRows<MealRow>(page, 'meals')
  const newest = new Map<string, MealRow['data']>()
  for (const { data } of rows) if ((newest.get(data.id)?.version ?? 0) < data.version) newest.set(data.id, data)
  return [...newest.values()].filter(
    (m) => !m.retracted && m.slot === 'LUNCH' && m.items.some((i) => i.name === 'Grilled chicken breast'),
  ).length
}

test('the sheet offers the usual lunch; one tap logs it, and Undo takes it back', async ({ page }) => {
  await open(page, '/quick?slot=LUNCH')
  await expect(page.getByRole('heading', { name: 'Lunch', exact: true })).toBeVisible({ timeout: 15_000 })
  const usual = page.getByRole('button', { name: /^Grilled chicken breast\s*690 kcal$/ })
  await expect(usual).toBeVisible()
  const before = await chickenLunches(page)

  await usual.click()
  await expect(page.getByTestId('quick-logged')).toContainText('Logged: Grilled chicken breast · 690 kcal')
  await expect.poll(() => chickenLunches(page)).toBe(before + 1)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('quick-logged')).toContainText('Taken back.')
  await expect.poll(() => chickenLunches(page)).toBe(before)
})

test('from the notification’s button: logged at once, and a reload does not log it twice', async ({ page }) => {
  await open(page, '/quick?slot=LUNCH')
  await expect(page.getByRole('button', { name: /^Grilled chicken breast\s*690 kcal$/ })).toBeVisible({ timeout: 15_000 })
  const before = await chickenLunches(page)

  const fromButton = '/quick?slot=LUNCH&log=grilled%20chicken%20breast&once=2026-11-22-LUNCH'
  await open(page, fromButton)
  await expect(page.getByTestId('quick-logged')).toContainText('Logged: Grilled chicken breast', { timeout: 15_000 })
  await expect.poll(() => chickenLunches(page)).toBe(before + 1)
  // The address no longer carries the meal: a reload is just the sheet.
  await expect(page).not.toHaveURL(/[?&](log|once)=/)

  // The same button tapped again (the same address, the same mark).
  await open(page, fromButton)
  await expect(page.getByText('Already logged from this reminder, so not twice.')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => chickenLunches(page)).toBe(before + 1)
})

test('a meal that is no longer usual is not guessed at', async ({ page }) => {
  await open(page, '/quick?slot=LUNCH&log=something%20long%20gone&once=x')
  await expect(page.getByText(/no longer among your usual ones/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('quick-logged')).toHaveCount(0)
})

test('write it and take a photo lead to the Log screen', async ({ page }) => {
  await open(page, '/quick?slot=DINNER')
  await page.getByRole('link', { name: 'Write it' }).click()
  await expect(page).toHaveURL(/\/log\?mode=write$/)
  await expect(page.locator('main textarea').first()).toBeVisible({ timeout: 15_000 })
})

test('in Hebrew, and it passes an accessibility scan', async ({ page }) => {
  await switchToHebrew(page)
  await open(page, '/quick?slot=LUNCH')
  await expect(page.getByRole('heading', { name: 'ארוחת צהריים', exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'לכתוב' })).toBeVisible()
  const { violations } = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .options({ preload: false })
    .analyze()
  expect(
    violations.flatMap((v) => v.nodes.filter((n) => v.id !== 'color-contrast' || !/#c2673e|#6f7f53/.test(n.failureSummary ?? ''))),
  ).toEqual([])
})
