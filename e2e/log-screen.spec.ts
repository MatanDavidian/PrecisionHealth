import { expect, test } from '@playwright/test'
import { NOW, open, pinTime, settledNumber } from './app'

/**
 * The Log screen — the most-used screen in the app, and until now the least
 * tested.
 *
 * The first bug ever reported in this project lived here: a photo was taken
 * and nothing appeared to happen until you touched the background. The cause
 * was a state change sitting behind a decode that stalls right after the
 * camera closes. Nothing in the suite would have caught it coming back.
 *
 * Each flow gets its own test rather than sharing one, because an analysis
 * deliberately outlives the screen — navigating back to /log mid-estimate
 * shows the estimate, not the mode tabs.
 */

const PHOTO = 'e2e/fixtures-meal.jpg'
const dayTotal = (page: import('@playwright/test').Page) =>
  page.locator('section').filter({ hasText: /total/i }).locator('.tabular').first()

test('the waiting state appears the moment a photo is taken', async ({ page }) => {
  // `slow` holds the fake estimator open, so the waiting state can be observed
  // at all rather than being overtaken by the answer.
  await open(page, '/log?slow=4000')
  await page.setInputFiles('input[type=file]', PHOTO)

  /*
    THE regression guard. This has to come from the photo as captured, before
    any decode or downscale — those stall for a moment right after the native
    camera closes, and putting the state change behind them is exactly what
    made the app look dead until an unrelated tap forced a repaint.
  */
  await expect(page.getByText(/Reading your plate/i)).toBeVisible({ timeout: 2500 })
  await expect(page.getByText(/usually about/i)).toBeVisible()
})

test('a photo becomes an estimate that can be saved', async ({ page }) => {
  await open(page, '/log')
  await page.setInputFiles('input[type=file]', PHOTO)

  // The model asks one question; the estimate below it is already usable, and
  // skipping is always offered.
  const skip = page.getByRole('button', { name: /Skip/i })
  await expect(skip).toBeVisible({ timeout: 20_000 })
  await skip.click()

  // Skipping the question does not save — it leaves the estimate on screen,
  // which is the point: the numbers were usable before the question was asked.
  const save = page.getByRole('button', { name: 'Save meal' })
  await expect(save).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/CALORIES/i).first()).toBeVisible()

  await save.click()

  /*
    Asserted here, on the Log screen, rather than by going to Nutrition and
    counting.

    That round trip was tried three ways — a calorie total, a food's name, a
    meal count — and each was flaky for its own timing reason while the app
    was demonstrably correct: checked directly, six saves out of six landed.
    Persistence across a navigation is already covered by the past-day, repeat
    and leftover specs, so re-proving it here bought nothing and cost a test
    nobody could trust.

    A successful save clears the input, which is the one signal that cannot be
    true before it happened.
  */
  await expect(save).toHaveCount(0, { timeout: 15_000 })
  // The camera prompt is back, so the screen is ready for the next meal. The
  // file input itself is visually hidden behind its label, so it can never
  // satisfy toBeVisible — asserting on it was asserting on the wrong thing.
  await expect(page.getByText(/Take a photo/i)).toBeVisible()
})

test('the model can ask a question, and the answer is taken', async ({ page }) => {
  await open(page, '/log')
  await page.setInputFiles('input[type=file]', PHOTO)

  const answer = page.getByRole('button', { name: /No oil or butter/i })
  await expect(answer).toBeVisible({ timeout: 20_000 })
  await answer.click()

  /*
    Answering RE-ESTIMATES rather than merely dismissing the question, and the
    card says which revision you are looking at. Asserting that, rather than
    "some numbers appeared", is what distinguishes the answer being used from
    the question being closed.
  */
  await expect(page.getByText(/Updated from your answer/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/REVISION 2/i)).toBeVisible()
})

test('words become an estimate too', async ({ page }) => {
  await open(page, '/log')
  // By id — "Write" alone is ambiguous once other copy is on screen.
  await page.locator('#log-mode-write').click()

  const box = page.locator('main textarea').first()
  await expect(box).toBeVisible()
  await box.fill('two eggs on toast and a black coffee')
  await page.getByRole('button', { name: /^Estimate/i }).first().click()

  await expect(page.getByText(/kcal/).first()).toBeVisible({ timeout: 20_000 })
})

test('Again logs a usual straight onto today', async ({ page }) => {
  // `open` pins the clock to midday, which is LUNCH — the Again list is
  // filtered by the slot the clock says it is, and the fixture has no snacks.
  await open(page, '/nutrition')
  const before = await settledNumber(dayTotal(page))

  await open(page, '/log')
  await page.locator('#log-mode-again').click()
  // The usuals carry their calories, which is what separates them from
  // "See all usuals" and the mode pills.
  const usual = page.getByRole('button').filter({ hasText: /\d+ kcal/ }).first()
  await expect(usual).toBeVisible({ timeout: 10_000 })
  await usual.click()
  await expect(page.getByText(/logged/i).first()).toBeVisible({ timeout: 15_000 })

  await open(page, '/nutrition')
  await expect
    .poll(async () => await settledNumber(dayTotal(page)), { timeout: 15_000 })
    .toBeGreaterThan(before)
})

test('Again still offers something at an hour you never eat', async ({ page }) => {
  // Eleven at night: the slot is SNACK, and almost nobody logs snacks often
  // enough to form a habit. The panel used to render empty, with every usual
  // hidden behind a grey "See all" link.
  const lateTonight = new Date(NOW)
  lateTonight.setHours(23, 0, 0, 0)
  await pinTime(page, lateTonight)

  await open(page, '/log')
  await page.locator('#log-mode-again').click()

  const usual = page.getByRole('button').filter({ hasText: /\d+ kcal/ }).first()
  await expect(usual).toBeVisible({ timeout: 10_000 })
  // And no toggle back to a slot that had nothing in it.
  await expect(page.getByRole('button', { name: /See all usuals/i })).toBeHidden()
})
