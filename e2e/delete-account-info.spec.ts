import { expect, test } from '@playwright/test'
import { open } from './app'
import { STUB_ACCOUNT, stubSupabase } from './supabase'

/**
 * The public page on deleting an account (Google Play requires one reachable
 * outside the app). Readable signed out, and before agreeing to anything.
 */

test('signed out, the page says how to delete, what goes, and what to do without access', async ({ page }) => {
  await open(page, '/delete-account')
  await expect(page.getByRole('heading', { name: 'Delete your account' })).toBeVisible()
  await expect(page.getByText(/Settings → Account & data → Delete my account/)).toBeVisible()
  await expect(page.getByText(/cancelled first — at Lemon Squeezy or Google Play/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'support@vimetry.app' })).toHaveAttribute('href', 'mailto:support@vimetry.app')
  await page.getByRole('link', { name: 'Go to Account & data' }).click()
  await expect(page.getByText('Where your data is saved')).toBeVisible()
})

test('a signed-in account that has not agreed yet can still read it', async ({ page }) => {
  await stubSupabase(page)
  // Signed in through the form, but the policies not yet accepted.
  await page.goto('/signin')
  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter the code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeVisible({ timeout: 15_000 })

  await page.goto('/delete-account')
  await expect(page.getByRole('heading', { name: 'Delete your account' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Agree and continue' })).toHaveCount(0)
})

test('and in Hebrew', async ({ page, browser }) => {
  const context = await browser.newContext({ locale: 'he-IL' })
  const hebrew = await context.newPage()
  await stubSupabase(hebrew)
  await hebrew.goto('/delete-account?fake=1')
  await expect(hebrew.getByRole('heading', { name: 'מחיקת החשבון' })).toBeVisible()
  await context.close()
  void page
})
