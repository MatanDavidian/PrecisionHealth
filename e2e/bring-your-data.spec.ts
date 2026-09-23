import { expect, test, type Page } from '@playwright/test'
import { dayKey, open } from './app'
import { openSignedIn, signIn, STUB_ACCOUNT } from './supabase'

/**
 * Moving what this browser holds into an account, the first time you sign in.
 *
 * Of everything the app does, this is the step hardest to take back: a move
 * that drops a meal loses it, and one that runs twice doubles a week. So the
 * account side is a stub that KEEPS what it is sent (`keep: true`), and every
 * test reads that, not only the sentence on screen.
 *
 * Two records of the person's own are made first, while signed out: a meal
 * logged with Again, and yesterday filled from the average. The sample day is
 * also in the store, and must be left behind — it was never theirs.
 */

async function logTwoRecordsOfYourOwn(page: Page) {
  // A meal, onto today.
  await open(page, '/log')
  await page.locator('#log-mode-again').click()
  const usual = page.getByRole('button').filter({ hasText: /\d+ kcal/ }).first()
  await expect(usual).toBeVisible({ timeout: 10_000 })
  await usual.click()
  await expect(page.getByText(/logged/i).first()).toBeVisible({ timeout: 15_000 })

  // And an estimate, onto yesterday.
  await open(page, '/today?view=week')
  await page.getByRole('button', { name: /Fill it from your average/ }).click()
  await expect(page.getByText('Filled from your average.')).toBeVisible({ timeout: 15_000 })
}

const offer = (page: Page) => page.getByRole('heading', { name: 'Bring your data with you' })

type MealRow = {
  user_id: string
  meal_id: string
  day: string
  data: { userId: string; provenance: { source: string } }
}

const GENERATED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

test('your records move into the account, the sample day stays behind, and the estimate stays an estimate', async ({
  page,
}) => {
  await logTwoRecordsOfYourOwn(page)
  const tables = await signIn(page, { keep: true })

  await openSignedIn(page, '/today')
  await expect(offer(page)).toBeVisible({ timeout: 15_000 })
  // It says what it will move before it moves it — two records, not the sample day's four.
  await expect(page.getByText('This browser holds 2 records you logged across 2 days.', { exact: false })).toBeVisible()
  await expect(page.getByText(/The sample day stays behind/)).toBeVisible()

  await page.getByRole('button', { name: 'Move my data' }).click()
  await expect(page.getByText('Moved 2 meals into your account.')).toBeVisible({ timeout: 15_000 })

  // What the account received — exactly the two, both now the account's.
  const meals = tables.meals as MealRow[]
  expect(meals).toHaveLength(2)
  for (const row of meals) {
    expect(row.user_id).toBe(STUB_ACCOUNT.id)
    expect(row.data.userId).toBe(STUB_ACCOUNT.id)
    // Created in this browser, not shipped with the app.
    expect(row.meal_id).toMatch(GENERATED)
  }
  expect(meals.map((row) => row.day).sort()).toEqual([dayKey(-1), dayKey(0)])

  // The filled day is still marked as one, on the far side of the move.
  const moved = meals.find((row) => row.day === dayKey(-1))!
  expect(moved.data.provenance.source).toBe('PATTERN_FILL')

  // And reading it back through the account shows it the same way it did locally.
  await openSignedIn(page, `/nutrition?d=${dayKey(-1)}`)
  await expect(page.getByText(/these are your average day/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Logged (0)')).toBeVisible()

  // Asked once. A prompt that reappears after the move invites a second one.
  await openSignedIn(page, '/today')
  await expect(page.getByText(/Nothing logged yet today|Calories/).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(offer(page)).toHaveCount(0)
})

test('"Not now" moves nothing, and does not ask again', async ({ page }) => {
  await logTwoRecordsOfYourOwn(page)
  const tables = await signIn(page, { keep: true })

  await openSignedIn(page, '/today')
  await expect(offer(page)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(offer(page)).toHaveCount(0)

  await openSignedIn(page, '/today')
  await expect(page.getByText(/Nothing logged yet today|Calories/).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(offer(page)).toHaveCount(0)
  expect(tables.meals).toHaveLength(0)
})

test('moving twice duplicates nothing, and says what was already there', async ({ page }) => {
  /*
    An interrupted move — a closed tab, a dropped connection — has to be safe
    to run again. The account refuses a record it already holds, and the app
    reads that refusal as "already there", not as a failure and not as a
    reason to write a second copy.
  */
  await logTwoRecordsOfYourOwn(page)
  const tables = await signIn(page, { keep: true })

  await openSignedIn(page, '/today')
  await page.getByRole('button', { name: 'Move my data' }).click()
  await expect(page.getByText('Moved 2 meals into your account.')).toBeVisible({ timeout: 15_000 })

  // Forget that it happened — the state a second browser tab, or a cleared
  // flag, would be in — and run it again.
  await page.evaluate((id) => localStorage.removeItem(`adopted-into:${id}`), STUB_ACCOUNT.id)
  await openSignedIn(page, '/today')
  await page.getByRole('button', { name: 'Move my data' }).click()
  await expect(page.getByText(/2 were already there/)).toBeVisible({ timeout: 15_000 })

  expect(tables.meals).toHaveLength(2)
})
