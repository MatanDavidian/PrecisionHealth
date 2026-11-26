import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { dayKey, open, switchToHebrew } from './app'

/**
 * What to eat now (docs/features/meal-suggestions.md).
 *
 * The sample day is on target for calories (20 kcal left) with protein 17 g
 * short, and the week so far 190 kcal under its targets: so it offers a
 * protein snack. Deleting its dinner leaves room to fill; adding a big meal
 * leaves no room in the week, and the card says to stop. The fake model
 * builds its answers from the sample person's own foods, his most logged
 * meal, and one new idea.
 */

const card = (page: Page) => page.getByTestId('targets-card')
const section = (page: Page) => page.getByTestId('suggest-meals')
const suggestions = (page: Page) => page.getByTestId('suggestion')

async function eatenKcal(page: Page): Promise<number> {
  return Number((await card(page).locator('.font-display').first().innerText()).replace(/[^\d]/g, ''))
}

/** Takes the sample day's first meal back, which leaves room to fill. */
async function makeRoom(page: Page) {
  await open(page, '/nutrition')
  await page.locator('button[aria-label^="Delete "]').first().click()
  await expect(page.getByRole('button', { name: /Undo/i })).toBeVisible({ timeout: 10_000 })
}

/** Adds a big meal today, so neither the day nor the week has room. */
async function overfill(page: Page) {
  await open(page, '/nutrition')
  await page.getByRole('button', { name: 'Add meal', exact: true }).click()
  const form = page.locator('form')
  await form.getByLabel('Food').fill('A big dinner out')
  await form.getByLabel('Grams').fill('600')
  await form.getByLabel('kcal').fill('1200')
  await form.getByRole('button', { name: 'Save meal' }).click()
  await expect(page.getByText('A big dinner out')).toBeVisible()
}

async function askOnToday(page: Page) {
  await makeRoom(page)
  await open(page, '/today')
  await expect(section(page)).toBeVisible({ timeout: 15_000 })
  await section(page).getByRole('button', { name: 'Suggest what to eat' }).click()
  await expect(suggestions(page)).toHaveCount(3, { timeout: 15_000 })
}

test('today, with room left, the card offers to suggest what to eat', async ({ page }) => {
  await makeRoom(page)
  await open(page, '/today')
  await expect(section(page)).toBeVisible({ timeout: 15_000 })
  await expect(section(page).getByText('Left today:')).toBeVisible()
  await expect(section(page).getByText(/g protein/)).toBeVisible()
  await expect(section(page).getByText(/Uses one written analysis. Built from what you usually eat./)).toBeVisible()
  await expect(section(page).getByTestId('suggest-week')).toHaveText(/^Week so far: [\d,]+ kcal (under|over) your targets\.$/)
})

test('calories used but protein short, with room in the week: a lean protein snack, within the room', async ({ page }) => {
  await open(page, '/today')
  await expect(section(page).getByTestId('suggest-line')).toHaveText('Left today: 20 kcal · 17 g protein', { timeout: 15_000 })
  await expect(section(page).getByTestId('suggest-week')).toHaveText(
    'Week so far: 190 kcal under your targets. A light protein snack still fits.',
  )
  await section(page).getByRole('button', { name: 'Suggest a protein snack' }).click()
  await expect(section(page).getByRole('heading', { name: 'A light protein snack: up to 190 kcal, the most protein for it' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(suggestions(page)).toHaveCount(2)
  await expect(section(page).getByText('The rest can wait for tomorrow.')).toBeVisible()
  for (let i = 0; i < 2; i++) {
    const kcal = Number((await suggestions(page).nth(i).getByText(/^[\d,]+ kcal · /).innerText()).split(' kcal')[0].replace(/[^\d]/g, ''))
    expect(kcal).toBeLessThanOrEqual(190)
    await expect(suggestions(page).nth(i).getByTestId('suggestion-fit')).toHaveText(
      /^\+[\d,]+ kcal today · protein \d+ of 145 g( ✓)? · week [\d,]+ (under|over)$/,
    )
  }
})

test('no room in the day or the week: better to stop, and it costs nothing to say', async ({ page }) => {
  await overfill(page)
  await open(page, '/today')
  await expect(section(page).getByTestId('suggest-stop')).toBeVisible({ timeout: 15_000 })
  await expect(section(page).getByTestId('suggest-line')).toHaveText(/^[\d,]+ kcal over today · 17 g protein short$/)
  await expect(section(page).getByTestId('suggest-stop')).toContainText('Better to stop for today.')
  await expect(section(page).getByTestId('suggest-stop')).toContainText('The 17 g of protein can wait: start tomorrow with it.')
  await expect(section(page).getByRole('button', { name: 'Suggest a protein snack' })).toHaveCount(0)

  // Hungry anyway: something very light, on request.
  await section(page).getByRole('button', { name: 'Hungry anyway? Suggest something light' }).click()
  await expect(section(page).getByRole('heading', { name: /up to 120 kcal/ })).toBeVisible({ timeout: 15_000 })
  for (const kcal of await suggestions(page).getByText(/^[\d,]+ kcal · /).allInnerTexts()) {
    expect(Number(kcal.split(' kcal')[0].replace(/[^\d]/g, ''))).toBeLessThanOrEqual(120)
  }
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
  const kcal = Number((await yogurt.getByText(/^[\d,]+ kcal · /).innerText()).split(' kcal')[0].replace(/[^\d]/g, ''))

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
  await makeRoom(page)
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

test('in Hebrew, the protein snack reads right', async ({ page }) => {
  await switchToHebrew(page)
  await open(page, '/today')
  await expect(section(page).getByTestId('suggest-week')).toHaveText(
    'השבוע עד עכשיו: 190 קלוריות מתחת ליעדים. נשנוש חלבון קל עדיין נכנס.',
    { timeout: 15_000 },
  )
  await expect(section(page).getByRole('button', { name: 'הצעה לנשנוש חלבון' })).toBeVisible()
})

test('in Hebrew, the stop reads right', async ({ page }) => {
  await overfill(page)
  await switchToHebrew(page)
  await open(page, '/today')
  await expect(section(page).getByTestId('suggest-stop')).toContainText('עדיף לעצור להיום.', { timeout: 15_000 })
  await expect(section(page).getByTestId('suggest-stop')).toContainText('17 גרם החלבון יכולים לחכות')
  await expect(section(page).getByRole('button', { name: 'רעבים בכל זאת? הצעה למשהו קל' })).toBeVisible()
})
