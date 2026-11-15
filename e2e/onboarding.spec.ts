import { expect, test } from '@playwright/test'
import { open, switchToHebrew } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * The first minute (docs/PHASE-1-FINISH.md, onboarding): a stranger is told
 * what this is and where what they log is kept, and a new account is told
 * what to do first. Each is said once, and neither blocks the app.
 */

test('a first visit says what Vimetry is and where the data stays, once', async ({ page }) => {
  await open(page, '/today')
  await expect(page.getByText('Welcome to Vimetry')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/by photo, in words or by hand/)).toBeVisible()
  await expect(page.getByText(/Until you sign in, what you log stays in this browser/)).toBeVisible()
  // Not a modal: the day underneath is there to be looked at straight away.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByText('Welcome to Vimetry')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Welcome to Vimetry')).toHaveCount(0)
})

test('its one action is the way to the free analyses', async ({ page }) => {
  await open(page, '/today')
  await page.getByRole('link', { name: 'Sign in and get 10 free analyses' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  // Followed is read: it does not greet them again on the way back.
  await open(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Welcome to Vimetry')).toHaveCount(0)
})

test('in Hebrew it is said in Hebrew', async ({ page }) => {
  await switchToHebrew(page)
  await open(page, '/today')
  await expect(page.getByText('ברוכים הבאים ל־Vimetry')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'כניסה וקבלת 10 ניתוחים בחינם' })).toBeVisible()
})

test('a new account with nothing logged is told where to start, once', async ({ page }) => {
  await signIn(page)
  await openSignedIn(page, '/today')
  await expect(page.getByText('Nothing logged yet. Start with your next meal.')).toBeVisible({ timeout: 15_000 })
  // An account is past the welcome: that is for someone who has not signed in.
  await expect(page.getByText('Welcome to Vimetry')).toHaveCount(0)

  await page.getByRole('link', { name: 'Log a meal' }).click()
  await expect(page).toHaveURL(/\/log$/)
  await openSignedIn(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Nothing logged yet. Start with your next meal.')).toHaveCount(0)
})
