import { expect, test, type Page } from '@playwright/test'
import { NOW, pinTime } from './app'
import { acceptPolicies, stubSupabase, STUB_ACCOUNT } from './supabase'

/**
 * A new visitor's first photo (features/first-photo.md).
 *
 * Signed out, with no key of their own, the photo used to go nowhere: "No API
 * key configured" and a Try again that could not work. Now it is held, the
 * visitor is asked to sign in at that moment, and it is analysed by itself on
 * return, but only after a new account has agreed to the policies.
 *
 * These pages open WITHOUT `?fake=1`: the fake model needs no key, and the
 * path under test is the one where a key is missing.
 */

/** The analysis server, counting calls and holding each open so the waiting state shows. */
async function countAnalyses(page: Page) {
  const calls: string[] = []
  await page.route('**/functions/v1/estimate-food**', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { photo?: string; text?: string }
    calls.push(body.photo ? 'photo' : 'text')
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"held_by_test"}' })
  })
  return calls
}

async function openSignedOut(page: Page, path: string) {
  await pinTime(page, NOW)
  await page.route(/\/functions\/v1\/report-(error|ai)/, (route) => route.fulfill({ status: 204 }))
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

async function signInWithCode(page: Page) {
  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter the code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
}

test('a photo taken signed out waits for sign-in, then is read only after consent', async ({ page }) => {
  await stubSupabase(page)
  const calls = await countAnalyses(page)
  await openSignedOut(page, '/log')

  // Before: what the camera leads to, said under it.
  await expect(page.getByText(/10 free analyses come with a free account/)).toBeVisible({ timeout: 15_000 })

  await page.setInputFiles('input[type=file]', 'e2e/fixtures-meal.jpg')
  await expect(page.getByRole('heading', { name: 'Your photo is ready' })).toBeVisible()
  await expect(page.getByText('No API key configured')).toHaveCount(0)
  await expect(page.getByText(/Reading your plate/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Have an OpenAI key? Use your own instead' })).toBeVisible()

  await page.getByRole('link', { name: 'Continue with email' }).click()
  await expect(page).toHaveURL(/\/signin\?next=\/log$/)
  await expect(page.getByText(/Your photo is waiting/)).toBeVisible()
  await signInWithCode(page)

  // A new account agrees first; until then nothing is sent.
  await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1_500)
  expect(calls).toEqual([])

  await acceptPolicies(page)
  await expect.poll(() => calls).toEqual(['photo'])
  await expect(page.getByText(/Reading your plate/)).toBeVisible()
  await expect(page.getByText('Signed in. 10 free analyses, and this is the first.')).toBeVisible()
})

test('an account that has agreed already is read straight away on return', async ({ page }) => {
  await stubSupabase(page, { consented: true })
  const calls = await countAnalyses(page)
  await openSignedOut(page, '/log')
  await page.setInputFiles('input[type=file]', 'e2e/fixtures-meal.jpg')
  await page.getByRole('link', { name: 'Continue with email' }).click()
  await signInWithCode(page)
  await expect.poll(() => calls, { timeout: 15_000 }).toEqual(['photo'])
  await expect(page).toHaveURL(/\/log$/)
})

test('a meal in words waits the same way', async ({ page }) => {
  await stubSupabase(page, { consented: true })
  const calls = await countAnalyses(page)
  await openSignedOut(page, '/log')
  await page.locator('#log-mode-write').click()
  await expect(page.getByText(/Write the meal first/)).toBeVisible()
  await page.locator('main textarea').first().fill('two eggs and a slice of toast')
  await page.getByRole('button', { name: /^Estimate/i }).first().click()

  await expect(page.getByRole('heading', { name: 'Ready to estimate' })).toBeVisible()
  expect(calls).toEqual([])
  await page.getByRole('link', { name: 'Continue with email' }).click()
  await expect(page.getByText(/What you wrote is waiting/)).toBeVisible()
  await signInWithCode(page)
  await expect.poll(() => calls, { timeout: 15_000 }).toEqual(['text'])
})

test('discarding the waiting photo goes back to the camera, and nothing was sent', async ({ page }) => {
  await stubSupabase(page)
  const calls = await countAnalyses(page)
  await openSignedOut(page, '/log')
  await page.setInputFiles('input[type=file]', 'e2e/fixtures-meal.jpg')
  await page.getByRole('button', { name: 'Discard photo' }).click()
  await expect(page.getByRole('button', { name: /Take a photo/ })).toBeVisible()
  expect(calls).toEqual([])
})

test('inside the Android app there is no own-key way around the account', async ({ page }) => {
  await stubSupabase(page)
  // The app is known by `?source=twa` on the page that reads it (or by its android-app:// referrer).
  await openSignedOut(page, '/log?source=twa')
  await page.setInputFiles('input[type=file]', 'e2e/fixtures-meal.jpg')
  await expect(page.getByRole('heading', { name: 'Your photo is ready' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: /Use your own instead/ })).toHaveCount(0)
})

test('in Hebrew, the waiting photo speaks Hebrew', async ({ page }) => {
  await stubSupabase(page)
  await openSignedOut(page, '/settings?tab=account')
  await page.getByRole('button', { name: 'עברית' }).click()
  await page.locator('html[dir="rtl"]').waitFor()
  await page.goto('/log')
  await page.setInputFiles('input[type=file]', 'e2e/fixtures-meal.jpg')
  await expect(page.getByRole('heading', { name: 'התמונה מוכנה' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'המשך עם אימייל' })).toBeVisible()
})
