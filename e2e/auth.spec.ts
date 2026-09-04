import { expect, test } from '@playwright/test'
import { open } from './app'
import { dismissLanguagePrompt, openSignedIn, signIn, stubSupabase, STUB_ACCOUNT } from './supabase'

/**
 * Signing in, signing out, and what someone who has done neither sees.
 *
 * S2.9. The account is the seam between "a browser holds my data" and "an
 * account does", and every screen changes meaning across it — so it is the
 * last place that should have been going untested.
 */

test('a visitor who has not signed in is told so, and told what that means', async ({ page }) => {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'Account' }).click()

  await expect(page.getByText(/Not signed in|Nobody is signed in/i).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

  // The honest version of "where is my data": this browser, and nowhere else.
  await expect(page.getByText(/In this browser only/)).toBeVisible()
})

test('the form will not send until it has an email', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/signin')

  const send = page.getByRole('button', { name: 'Email me a code' })
  await expect(send).toBeDisabled()

  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await expect(send).toBeEnabled()
  await send.click()

  // The link is the real path; the code box is the second offer, because a
  // stock Supabase template does not include a code at all.
  await expect(page.getByText(new RegExp(`Check ${STUB_ACCOUNT.email}`))).toBeVisible()
  await expect(page.getByLabel(/Or enter a code/)).toBeVisible()

  await page.getByRole('button', { name: 'Use another email' }).click()
  await expect(send).toBeVisible()
})

test('a send that fails says why, and leaves you able to try again', async ({ page }) => {
  await stubSupabase(page, { sendFails: 'Email rate limit exceeded' })
  await page.goto('/signin')

  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()

  await expect(page.getByText(/Email rate limit exceeded/)).toBeVisible()
  // Back on the email step rather than stranded on a code that was never sent.
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeEnabled()
})

test('a rejected code keeps you on the code step, so you can retype it', async ({ page }) => {
  await stubSupabase(page, { codeFails: 'Token has expired or is invalid' })
  await page.goto('/signin')

  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter a code/).fill('000000')
  await page.getByRole('button', { name: 'Sign in with code' }).click()

  await expect(page.getByText(/expired or is invalid/)).toBeVisible()
  await expect(page).toHaveURL(/\/signin/)
  await expect(page.getByLabel(/Or enter a code/)).toHaveValue('000000')
})

test('signing in swaps the store, and the sample day does not follow you in', async ({ page }) => {
  // Signed out first, so there is demonstrably something local to leave behind.
  await open(page, '/today')
  await expect(page.getByText(/Nothing logged yet today/)).toBeHidden()

  await signIn(page)

  await expect(page).toHaveURL(/\/today/)
  // A new account holds nothing. The sample day belongs to the local store,
  // and `ensureSeeded` is deliberately never called for someone signed in — if
  // it were, every new account would open onto four meals it never ate.
  await expect(page.getByText(/Nothing logged yet today/)).toBeVisible()

  await openSignedIn(page, '/nutrition')
  await expect(page.getByText('Grilled chicken breast')).toBeHidden()

  await openSignedIn(page, '/settings')
  await page.getByRole('button', { name: 'Account' }).click()
  await expect(page.getByText(STUB_ACCOUNT.email)).toBeVisible()
})

test('signing out hands you back to the browser you were using', async ({ page }) => {
  await open(page, '/today')
  await signIn(page)
  await openSignedIn(page, '/settings')
  await page.getByRole('button', { name: 'Account' }).click()

  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText(/In this browser only/)).toBeVisible()

  // And the local data is still there — signing out is not a delete.
  await page.goto('/nutrition')
  await expect(page.getByText('Grilled chicken breast').first()).toBeVisible()
})

test('the language question is asked on first sign-in, and can be waved off', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter a code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // Each option is written in its own language, so it is legible to the person
  // who wants it whatever the app is currently speaking.
  await expect(dialog.getByRole('button', { name: 'עברית' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'English' })).toBeVisible()

  await dismissLanguagePrompt(page)
  await expect(dialog).toBeHidden()

  // Postponing records nothing, so the app is still in the guessed language
  // rather than having been answered "English".
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})
