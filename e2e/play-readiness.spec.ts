import { expect, test } from '@playwright/test'
import { open } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * What Google Play's policies require of the app itself, checked where a
 * reviewer would look (docs/PHASE-1-FINISH.md, handover 2026-10-17):
 * - a privacy policy inside the app
 * - a not-a-medical-device disclaimer, with a consult-a-professional
 *   reminder, beside the AI's suggestions
 * - inside the Android app, no route to paying anyone but Google Play
 */

test('Settings carries the disclaimer and the policy links, on every tab, signed out', async ({ page }) => {
  await open(page, '/settings')
  for (const tab of ['You', 'Photo analysis', 'Account & data']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.getByText(/Vimetry is not a medical device/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Terms of Use' })).toBeVisible()
  }
  await page.getByRole('link', { name: 'Privacy Policy' }).click()
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
})

test('the week’s suggestions say they are not medical advice', async ({ page }) => {
  await open(page, '/today?view=week')
  await page.getByRole('button', { name: /Ask for insights/i }).click()
  await expect(page.getByText(/WHAT IS IN THE DATA/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/General suggestions, not medical advice — for medical questions, talk to a healthcare professional/))
    .toBeVisible()
})

test('in the Android app, signed out: sign in for the free analyses — no own-key setup', async ({ page }) => {
  await page.goto('/log?source=twa')
  await expect(page.getByRole('link', { name: 'Sign in for 10 free analyses' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Add API key' })).toHaveCount(0)
  await open(page, '/settings?tab=ai')
  await expect(page.locator('#apiKey')).toHaveCount(0)
  await expect(page.getByText(/platform\.openai\.com/)).toHaveCount(0)
})

test('in the Android app, on our account: no own-key option at all', async ({ page }) => {
  await signIn(page, { trialUsed: 2 })
  await openSignedIn(page, '/settings?tab=ai&source=twa')
  await expect(page.getByText('Accuracy or speed')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Use your own OpenAI key instead')).toHaveCount(0)
})

test('in the Android app, trial spent: the plan, not a key', async ({ page }) => {
  await signIn(page, { trialUsed: 10 })
  await openSignedIn(page, '/settings?tab=ai&source=twa')
  await expect(page.getByText(/In the app, photo and text analysis comes with/)).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('#apiKey')).toHaveCount(0)
})

test('on the website, the own-key option is as before', async ({ page }) => {
  await open(page, '/settings?tab=ai')
  await expect(page.locator('#apiKey')).toBeVisible({ timeout: 15_000 })
})

/*
  "Report this answer" (Google Play's AI-generated content policy): in the
  app, without leaving it, and carrying nothing of the meal or the answer.
*/
const REPORT_FIELDS = ['kind', 'model', 'note', 'reason', 'version']

test('an estimate can be reported, and the report carries nothing of the meal', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await open(page, '/log')
  await page.route('**/functions/v1/report-ai', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fulfill({ status: 204 })
  })
  await page.setInputFiles('input[type=file]', 'e2e/fixtures-meal.jpg')
  const skip = page.getByRole('button', { name: /Skip/i })
  await expect(skip).toBeVisible({ timeout: 20_000 })
  await skip.click()
  await expect(page.getByRole('button', { name: 'Save meal' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Report this answer' }).click()
  const form = page.getByRole('form', { name: 'Report this answer' })
  await expect(form.getByText(/Not your meal, your photo, the answer or your account/)).toBeVisible()
  await expect(form.getByRole('button', { name: 'Send report' })).toBeDisabled()
  await form.getByLabel('Offensive or inappropriate').check()
  await form.getByRole('textbox').fill('It was rude about my lunch')
  await form.getByRole('button', { name: 'Send report' }).click()

  await expect(page.getByText('Thank you — your report was sent.')).toBeVisible()
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ kind: 'estimate', reason: 'offensive', note: 'It was rude about my lunch' })
  expect(Object.keys(sent[0]).every((key) => REPORT_FIELDS.includes(key))).toBe(true)
  // The estimate is still there to save: reporting does not throw it away.
  await expect(page.getByRole('button', { name: 'Save meal' })).toBeVisible()
})

test('the week’s insights can be reported, and a failed send says so', async ({ page }) => {
  let fail = true
  const sent: Record<string, unknown>[] = []
  await open(page, '/today?view=week')
  await page.route('**/functions/v1/report-ai', async (route) => {
    if (fail) return route.fulfill({ status: 503 })
    sent.push(route.request().postDataJSON())
    await route.fulfill({ status: 204 })
  })
  await page.getByRole('button', { name: /Ask for insights/i }).click()
  await expect(page.getByText(/WHAT IS IN THE DATA/i)).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Report this answer' }).click()
  const form = page.getByRole('form', { name: 'Report this answer' })
  await form.getByLabel('Harmful or unsafe advice').check()
  await form.getByRole('button', { name: 'Send report' }).click()
  await expect(form.getByText(/could not be sent/)).toBeVisible()

  fail = false
  await form.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByText('Thank you — your report was sent.')).toBeVisible()
  expect(sent[0]).toMatchObject({ kind: 'insight', reason: 'harmful' })
  expect(Object.keys(sent[0]).every((key) => REPORT_FIELDS.includes(key))).toBe(true)
})
