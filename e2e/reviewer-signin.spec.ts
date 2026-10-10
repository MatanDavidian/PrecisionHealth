import { expect, test } from '@playwright/test'
import { STUB_ACCOUNT, stubSupabase } from './supabase'

/**
 * The app-store reviewer's way in (docs/ANDROID-APP.md, step 3).
 *
 * Google's reviewers must sign in, and cannot read a code we email. One
 * review account has a password; everyone else signs in by email code, and
 * the password path is a small, labelled link rather than a second front door.
 */

test('a reviewer signs in with a password, from a link on the sign-in card', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/signin')

  // The email code is still the way in; the reviewer path is a small link.
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible()
  await page.getByRole('button', { name: 'App reviewer? Sign in with a password' }).click()
  await expect(page.getByText(/Everyone else signs in with the code we email/)).toBeVisible()

  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByLabel('Password').fill('a-review-password')
  const token = page.waitForRequest((r) => r.url().includes('/auth/v1/token?grant_type=password'))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const sent = (await token).postDataJSON()
  expect(sent).toMatchObject({ email: STUB_ACCOUNT.email, password: 'a-review-password' })

  // Signed in, a new account meets the consent gate like anyone else.
  await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeVisible({ timeout: 15_000 })
})

test('a wrong password says so without saying which part was wrong', async ({ page }) => {
  await stubSupabase(page, { passwordFails: true })
  await page.goto('/signin')
  await page.getByRole('button', { name: 'App reviewer? Sign in with a password' }).click()
  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('That email and password were not accepted')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('and the way back to an email code is one tap', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/signin')
  await page.getByRole('button', { name: 'App reviewer? Sign in with a password' }).click()
  await page.getByRole('button', { name: 'Use an email code instead' }).click()
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveCount(0)
})
