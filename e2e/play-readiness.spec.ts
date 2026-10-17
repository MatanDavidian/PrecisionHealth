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
