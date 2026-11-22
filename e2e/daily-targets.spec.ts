import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { dayKey, open, switchToHebrew } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * Daily targets (docs/features/daily-targets.md).
 *
 * The sample person: losing fat, 72.8 kg, 178 cm, 36, a man, on his feet most
 * of the day, and a protein goal of 145 g. His watch reports too few days to
 * average, so the burn is estimated: (10 × 72.8 + 6.25 × 178 − 5 × 36 + 5) ×
 * 1.5 = 2,498, about 2,500. Less 350 for losing fat: 2,150 kcal. Fat is 30%
 * of that, 70 g; carbs take the rest, 235 g.
 */

const card = (page: Page) => page.getByTestId('targets-card')

/** The day's calories as the card shows them, as a number. */
async function eatenKcal(page: Page): Promise<number> {
  return Number((await card(page).locator('.font-display').first().innerText()).replace(/[^\d]/g, ''))
}

/** As though the profile had never been filled in: no height, age, sex or activity. */
async function forgetProfile(page: Page) {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('timeline-health')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction('profiles', 'readwrite')
    tx.objectStore('profiles').clear()
    await new Promise((resolve) => (tx.oncomplete = resolve))
    db.close()
  })
}

test('Today shows the day against its targets, and where they came from', async ({ page }) => {
  await open(page, '/today')
  await expect(card(page)).toBeVisible({ timeout: 15_000 })
  await expect(card(page).getByRole('heading', { name: "Today's targets" })).toBeVisible()
  await expect(card(page).getByText('of 2,150 kcal')).toBeVisible()

  // What is left is the target less what is eaten, unless the day is already near it.
  const eaten = await eatenKcal(page)
  const status = page.getByTestId('targets-status')
  if (Math.abs(2150 - eaten) <= 2150 * 0.05) await expect(status).toHaveText('On target')
  else if (eaten < 2150) await expect(status).toHaveText(`${(2150 - eaten).toLocaleString('en-US')} left`)
  else await expect(status).toHaveText(`${(eaten - 2150).toLocaleString('en-US')} over`)

  // Each macro against its own target; protein's is the goal he set.
  await expect(card(page).getByText(/^[\d,]+ \/ 145 g$/)).toBeVisible()
  await expect(card(page).getByText(/^[\d,]+ \/ 235 g$/)).toBeVisible()
  await expect(card(page).getByText(/^[\d,]+ \/ 70 g$/)).toBeVisible()
  await expect(card(page).getByRole('progressbar')).toHaveCount(4)

  await expect(
    card(page).getByText(
      'Lose weight + Lower body fat: 350 kcal under the 2,500 you burn on a typical day, estimated from your body and activity.',
    ),
  ).toBeVisible()
  // The card replaces the Nutrition card rather than repeating its four numbers.
  await expect(page.locator('main section').filter({ hasText: /^Nutrition/ })).toHaveCount(0)
})

test('a past day says what it came to: under or over, not "left"', async ({ page }) => {
  await open(page, `/today?d=${dayKey(-3)}`)
  await expect(card(page)).toBeVisible({ timeout: 15_000 })
  await expect(card(page).getByRole('heading', { name: /^Targets on / })).toBeVisible()
  await expect(page.getByTestId('targets-status')).toHaveText(/^([\d,]+ (under|over)|On target)$/)
})

test('"How?" opens the working, every step of it', async ({ page }) => {
  await open(page, '/today')
  await card(page).getByRole('link', { name: 'How?' }).click()
  await expect(page).toHaveURL(/\/settings\?tab=you#daily-targets$/)

  const tiles = page.getByTestId('targets-tiles')
  await expect(tiles.getByText('2,150')).toBeVisible({ timeout: 15_000 })
  await expect(tiles.getByText('145')).toBeVisible()
  await expect(page.getByText('You burn about 2,500 kcal a day: 1,666 at rest, × 1.5 for “On my feet”.')).toBeVisible()
  await expect(page.getByText('Lose weight + Lower body fat takes 350 kcal off that: 2,150 kcal.')).toBeVisible()
  await expect(page.getByText('Protein: the 145 g goal you set.')).toBeVisible()
  await expect(page.getByText('A starting point, not medical advice.')).toBeVisible()
})

test('a more active day moves the target, at once', async ({ page }) => {
  await open(page, '/settings')
  const tiles = page.getByTestId('targets-tiles')
  await expect(tiles.getByText('2,150')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Very active/ }).click()
  // 1,665.5 × 1.7 − 350 = 2,481, to the nearest 10.
  await expect(tiles.getByText('2,480')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Very active/ })).toHaveAttribute('aria-pressed', 'true')
})

test('without the details, a checklist; filling them in brings the targets', async ({ page }) => {
  await open(page, '/today')
  await expect(card(page)).toBeVisible({ timeout: 15_000 })
  await forgetProfile(page)
  await open(page, '/today')

  const setup = page.getByTestId('targets-setup')
  await expect(setup.getByRole('heading', { name: 'A few details, and your targets are ready' })).toBeVisible({
    timeout: 15_000,
  })
  // What is already known is ticked, and said.
  await expect(setup.getByText('Your goal: Lose weight + Lower body fat')).toBeVisible()
  await expect(setup.getByText('Your weight: 72.8 kg')).toBeVisible()
  await expect(setup.getByText('Height, age and activity, or a watch that reports calories burned')).toBeVisible()
  await expect(card(page)).toHaveCount(0)

  const { violations } = await new AxeBuilder({ page })
    .include('[data-testid="targets-setup"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .options({ preload: false })
    .analyze()
  // The brand orange behind the button is a recorded exception (accessibility.spec.ts).
  expect(
    violations.flatMap((v) => v.nodes.filter((n) => v.id !== 'color-contrast' || !/#c2673e/.test(n.failureSummary ?? ''))),
  ).toEqual([])

  await setup.getByRole('link', { name: 'Set them up' }).click()
  await expect(page).toHaveURL(/\/settings\?tab=you#about-you$/)

  const height = page.getByRole('spinbutton', { name: 'Height' })
  await expect(height).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Not set yet').first()).toBeVisible()
  // Typed as a person types: cleared, then the number. (Filling in the value
  // already shown, as a placeholder, would raise no change at all.)
  await height.fill('')
  await height.pressSequentially('178')
  await height.press('Enter')
  const year = page.getByRole('spinbutton', { name: 'Year of birth' })
  await year.fill('')
  await year.pressSequentially(String(Number(dayKey(0).slice(0, 4)) - 36))
  await year.press('Enter')
  await page.getByRole('button', { name: 'Male', exact: true }).click()
  await page.getByRole('button', { name: /^On my feet/ }).click()

  await expect(page.getByTestId('targets-tiles').getByText('2,150')).toBeVisible({ timeout: 15_000 })
  await open(page, '/today')
  await expect(card(page).getByText('of 2,150 kcal')).toBeVisible({ timeout: 15_000 })
})

test('a height of exactly the starting number can still be saved', async ({ page }) => {
  await open(page, '/today')
  await expect(card(page)).toBeVisible({ timeout: 15_000 })
  await forgetProfile(page)
  await open(page, '/settings')
  const height = page.getByRole('spinbutton', { name: 'Height' })
  await expect(height).toHaveValue('170', { timeout: 15_000 })
  // Typing the shown number and confirming it is saying "that is me".
  await height.fill('')
  await height.pressSequentially('170')
  await height.press('Enter')
  await expect(page.getByText('Not set yet')).toHaveCount(1) // the year of birth, still unset
})

test('the Nutrition tab shows each total against its target', async ({ page }) => {
  await open(page, '/nutrition')
  await expect(page.getByText('/ 2,150')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('/ 145 g')).toBeVisible()
  await expect(page.getByText('/ 235 g')).toBeVisible()
  await expect(page.getByText('/ 70 g')).toBeVisible()
})

test('in Hebrew, the card reads right to left', async ({ page }) => {
  await switchToHebrew(page)
  await open(page, '/today')
  await expect(card(page).getByRole('heading', { name: 'היעדים של היום' })).toBeVisible({ timeout: 15_000 })
  await expect(card(page).getByText('מתוך 2,150 קלוריות')).toBeVisible()
  await expect(card(page).getByRole('link', { name: 'איך?' })).toBeVisible()
  await expect(page.locator('html[dir="rtl"]')).toHaveCount(1)
})

test('a calorie target of your own, and back to automatic', async ({ page }) => {
  await open(page, '/settings')
  const own = page.getByTestId('own-numbers')
  const calories = own.getByRole('group', { name: 'Calories' })
  // "Automatic" says what it comes to, so the choice is between two numbers.
  await expect(calories.getByRole('button', { name: 'Automatic · 2,150 kcal' })).toHaveAttribute('aria-pressed', 'true', {
    timeout: 15_000,
  })
  await calories.getByRole('button', { name: 'My own' }).click()
  const field = own.getByRole('spinbutton', { name: 'Calories' })
  await expect(field).toHaveValue('2150', { timeout: 15_000 })
  await field.fill('')
  await field.pressSequentially('2000')
  await field.press('Enter')

  await expect(page.getByTestId('targets-tiles').getByText('2,000')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Calories: the 2,000 kcal you set yourself.')).toBeVisible()
  await open(page, '/today')
  await expect(card(page).getByText('of 2,000 kcal')).toBeVisible({ timeout: 15_000 })
  await expect(card(page).getByText('Your own target: 2,000 kcal.')).toBeVisible()

  await open(page, '/settings')
  await page.getByTestId('own-numbers').getByRole('group', { name: 'Calories' }).getByRole('button', { name: /^Automatic/ }).click()
  await expect(page.getByTestId('targets-tiles').getByText('2,150')).toBeVisible({ timeout: 15_000 })
})

test('the week shows each day against its target', async ({ page }) => {
  await open(page, '/today?view=week')
  const week = page.getByTestId('targets-week')
  await expect(week).toBeVisible({ timeout: 15_000 })
  await expect(week.getByRole('listitem')).toHaveCount(7)
  await expect(page.getByTestId('targets-week-summary')).toHaveText(
    /^\d+ of \d+ days? on target · protein reached on \d+ of \d+$/,
  )
  // Today, 2,130 of 2,150, is on target, and says so to a screen reader.
  await expect(week.getByRole('listitem', { name: /: on target, 2,130 of 2,150 kcal$/ })).toBeVisible()
})

test('logging yesterday on target makes a streak with today', async ({ page }) => {
  await open(page, '/today')
  await expect(card(page)).toBeVisible({ timeout: 15_000 })
  // Yesterday is empty in the sample: today alone is a run of one, which is not worth saying.
  await expect(page.getByTestId('targets-streak')).toHaveCount(0)

  await open(page, `/nutrition?d=${dayKey(-1)}`)
  await page.getByRole('button', { name: 'Add meal', exact: true }).click()
  const form = page.locator('form')
  await form.getByLabel('Time').fill('13:00')
  await form.getByLabel('Food').fill('A whole day, in one')
  await form.getByLabel('Grams').fill('900')
  await form.getByLabel('kcal').fill('2100')
  await form.getByRole('button', { name: 'Save meal' }).click()
  await expect(page.getByText('A whole day, in one')).toBeVisible()

  await open(page, '/today')
  await expect(page.getByTestId('targets-streak')).toHaveText(/^\d+ days on target in a row$/, { timeout: 15_000 })
})

test('details and a goal set before signing in come into the account; the sample’s do not', async ({ page }) => {
  await open(page, '/settings')
  const height = page.getByRole('spinbutton', { name: 'Height' })
  await expect(height).toBeVisible({ timeout: 15_000 })
  await height.fill('')
  await height.pressSequentially('165')
  await height.press('Enter')
  await page.getByRole('button', { name: 'Female', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Female', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Build muscle' }).click()
  await expect(page.getByRole('button', { name: 'Build muscle' })).toHaveAttribute('aria-pressed', 'true')

  const tables = await signIn(page, { keep: true })
  await openSignedIn(page, '/today')
  await expect(page.getByRole('heading', { name: 'Bring your data with you' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Move my data' }).click()
  await expect(page.getByText('Moved your goal and body details into your account.')).toBeVisible({ timeout: 15_000 })

  const profile = tables.profiles[0] as { data: Record<string, unknown> }
  expect(profile.data).toMatchObject({ height: { value: 165, unit: 'cm' }, sex: 'FEMALE' })
  // The sample person's year of birth and activity stayed behind.
  expect(profile.data.birthYear).toBeUndefined()
  expect(profile.data.activity).toBeUndefined()
  // Added to the sample's answers: the whole choice travels.
  expect((tables.goals as { data: { choice?: { focus: string[] } } }[]).some((row) => row.data.choice?.focus.includes('MUSCLE'))).toBe(true)
})

test('goals as two answers: the weight, and what else', async ({ page }) => {
  await open(page, '/settings')
  const tiles = page.getByTestId('targets-tiles')
  await expect(tiles.getByText('2,150')).toBeVisible({ timeout: 15_000 })
  // The sample is losing weight while lowering body fat: one weight answer, one more.
  await expect(page.getByRole('radio', { name: 'Lose weight' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Lower body fat' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('goal-meaning')).toContainText('so what goes is fat')

  // The weight has one answer: keeping it switches losing off. Level calories.
  await page.getByRole('radio', { name: 'Keep my weight' }).click()
  await expect(page.getByRole('radio', { name: 'Keep my weight' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radio', { name: 'Lose weight' })).toHaveAttribute('aria-checked', 'false')
  await expect(tiles.getByText('2,500')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('goal-meaning')).toContainText('Same weight, less fat')

  // What else is any, or none.
  await page.getByRole('button', { name: 'Build muscle' }).click()
  await expect(page.getByRole('button', { name: 'Build muscle' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Lower body fat' })).toHaveAttribute('aria-pressed', 'true')

  // Today names the answers.
  await open(page, '/today')
  await expect(
    page.getByTestId('targets-card').getByText(/^Keep my weight \+ Build muscle \+ Lower body fat: about the 2,500 kcal/),
  ).toBeVisible({ timeout: 15_000 })
})
