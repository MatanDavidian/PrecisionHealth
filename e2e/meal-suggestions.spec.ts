import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { dayKey, open, switchToHebrew } from './app'

/**
 * What to eat now (docs/features/meal-suggestions.md).
 *
 * The sample day is on target for calories with protein 17 g short, so the
 * card offers suggestions; the fake model builds them from the sample
 * person's own foods, his most logged meal, and one new idea.
 */

const card = (page: Page) => page.getByTestId('targets-card')
const section = (page: Page) => page.getByTestId('suggest-meals')
const suggestions = (page: Page) => page.getByTestId('suggestion')

async function eatenKcal(page: Page): Promise<number> {
  return Number((await card(page).locator('.font-display').first().innerText()).replace(/[^\d]/g, ''))
}

async function askOnToday(page: Page) {
  await open(page, '/today')
  await expect(section(page)).toBeVisible({ timeout: 15_000 })
  await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
  await expect(suggestions(page)).toHaveCount(3, { timeout: 15_000 })
}

test('today, with room left, the card offers to suggest what to eat', async ({ page }) => {
  await open(page, '/today')
  await expect(section(page)).toBeVisible({ timeout: 15_000 })
  await expect(section(page).getByText('Left today:')).toBeVisible()
  await expect(section(page).getByText(/g protein/)).toBeVisible()
  await expect(section(page).getByText('Uses one written analysis. Built from what you usually eat.')).toBeVisible()
})

test('asking shows up to three suggestions, the best first, each with how it fits', async ({ page }) => {
  await askOnToday(page)
  await expect(suggestions(page).nth(0).getByText('From your foods')).toBeVisible()
  await expect(suggestions(page).nth(1).getByText('Your usual')).toBeVisible()
  await expect(suggestions(page).nth(2).getByText('New idea')).toBeVisible()
  await expect(suggestions(page).nth(2).getByText('Greek yogurt 0% with berries')).toBeVisible()
  for (let i = 0; i < 3; i++) {
    await expect(suggestions(page).nth(i).getByTestId('suggestion-fit')).toHaveText(/^(Leaves [\d,]+ kcal|[\d,]+ kcal over) · protein \d+ of 145 g/)
    await expect(suggestions(page).nth(i).getByText(/kcal · .* g protein · .* g carbs · .* g fat/)).toBeVisible()
  }
  await expect(section(page).getByText('General suggestions, not medical advice.')).toBeVisible()

  // Close puts the card back to one line.
  await section(page).getByRole('button', { name: 'Close' }).click()
  await expect(section(page).getByRole('button', { name: 'Suggest what to eat' })).toBeVisible()
})

test('Log it adds the meal at once, and Undo takes it back', async ({ page }) => {
  await askOnToday(page)
  const before = await eatenKcal(page)
  const yogurt = suggestions(page).nth(2)
  const kcal = Number((await yogurt.getByText(/kcal · /).innerText()).split(' kcal')[0].replace(/[^\d]/g, ''))

  await yogurt.getByRole('button', { name: 'Log it: Greek yogurt 0% with berries' }).click()
  await expect(section(page).getByRole('status')).toContainText('Greek yogurt 0% with berries')
  await expect.poll(() => eatenKcal(page)).toBe(before + kcal)

  await section(page).getByRole('button', { name: 'Undo' }).click()
  await expect(section(page).getByText('Taken back.')).toBeVisible()
  await expect.poll(() => eatenKcal(page)).toBe(before)
})

test('Take a photo opens the camera with the suggestion as the note', async ({ page }) => {
  await askOnToday(page)
  await suggestions(page).nth(2).getByRole('button', { name: 'Take a photo when it is ready: Greek yogurt 0% with berries' }).click()
  await expect(page).toHaveURL(/\/log\?mode=photo&note=/)
  await expect(page.getByLabel('A note about this meal')).toHaveValue(
    /^As suggested: Greek yogurt 0% with berries \(Greek yogurt 0%, Mixed berries\)\./,
  )
})

test('a past day has no suggestions', async ({ page }) => {
  await open(page, `/today?d=${dayKey(-3)}`)
  await expect(card(page)).toBeVisible({ timeout: 15_000 })
  await expect(section(page)).toHaveCount(0)
})

test('it reads in Hebrew, and passes an accessibility scan', async ({ page }) => {
  await switchToHebrew(page)
  await open(page, '/today')
  await expect(section(page).getByText('נשאר להיום:')).toBeVisible({ timeout: 15_000 })
  await section(page).getByRole('button', { name: 'מה לאכול עכשיו?' }).click()
  await expect(suggestions(page)).toHaveCount(3, { timeout: 15_000 })
  await expect(suggestions(page).nth(0).getByText('מהמזונות שלכם')).toBeVisible()
  await expect(suggestions(page).nth(2).getByText('יוגורט יווני 0% עם פירות יער')).toBeVisible()
  await expect(suggestions(page).nth(0).getByRole('button', { name: /^לרשום: / })).toBeVisible()
  await expect(suggestions(page).nth(0).getByTestId('suggestion-fit')).toContainText('חלבון')

  const { violations } = await new AxeBuilder({ page })
    .include('[data-testid="suggest-meals"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .options({ preload: false })
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
})
