import { expect, test } from '@playwright/test'
import { openSignedIn, signIn, STUB_ACCOUNT, stubSupabase } from './supabase'

/**
 * The free trial, and what happens when it runs out or the server does not
 * answer.
 *
 * S2.10, and the half of the app that only exists for people who have just
 * arrived: the notice that explains the accuracy trade-off, the model picker, and
 * the two states — spent, and unreachable — where an
 * analysis cannot happen. All of it was unreachable from a test until there
 * was an account to sign into.
 *
 * Note what is NOT faked here: the trial count is parsed out of a PostgREST
 * `content-range` header by `readTrialStatus`, and these tests drive that
 * parsing rather than short-circuiting it.
 */

test('a new account is told the trade-off exists, before it matters', async ({ page }) => {
  await signIn(page, { trialUsed: 0 })
  await openSignedIn(page, '/log')

  // Said once, on the first visit, while there is still a full trial to spend.
  await expect(page.getByText('Accuracy or speed — your choice')).toBeVisible()
  await expect(page.getByRole('link', { name: 'See the options' })).toBeVisible()
})

test('the picker offers exactly the two GPT-6 models, the best one first', async ({ page }) => {
  // Late in the trial, on purpose: there is no separate budget on the best model to lock it.
  await signIn(page, { trialUsed: 9 })
  await openSignedIn(page, '/settings')
  await page.getByRole('button', { name: 'Photo analysis' }).click()

  const picker = page.locator('select[name="trialModel"]')
  await expect(picker).toHaveValue('gpt-6.1-sol')
  await expect(picker.locator('option')).toHaveText([
    'Most accurate · gpt-6.1-sol',
    'Fastest · gpt-6-luna',
  ])
  await expect(picker.locator('option:disabled')).toHaveCount(0)

  await picker.selectOption('gpt-6-luna')
  await expect(picker).toHaveValue('gpt-6-luna')
  await expect(page.getByText(/Quick and rough/)).toBeVisible()
})

test('running out mid-analysis is a full stop with two ways forward', async ({ page }) => {
  /*
    The client thinks one analysis is left and the server disagrees. That is
    the real shape of it: `readTrialStatus` is documented as advisory, the
    edge function is what actually refuses, and this is the case where the two
    are allowed to differ. A test that set both to exhausted would never reach
    the refusal at all — the app would have switched to the direct estimator
    before asking.
  */
  await signIn(page, { trialUsed: 9, analysis: 'exhausted' })
  await openSignedIn(page, '/log')

  await page.locator('#log-mode-write').click()
  await page.locator('main textarea').first().fill('two eggs on toast and a black coffee')
  await page.getByRole('button', { name: /^Estimate/i }).first().click()

  await expect(page.getByText('That was the last one on us')).toBeVisible({ timeout: 20_000 })
  // Never a dead end: a way to keep using the AI, and a way to carry on without it.
  await expect(page.getByRole('link', { name: 'Connect my key' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Log by hand instead' })).toBeVisible()
  await expect(page.getByText(/What you wrote is still here/)).toBeVisible()
})

test('a server that cannot be reached is retryable, not a dead end', async ({ page }) => {
  await signIn(page, { trialUsed: 1, analysis: 'down' })
  await openSignedIn(page, '/log')

  await page.locator('#log-mode-write').click()
  await page.locator('main textarea').first().fill('a bowl of pasta with tomato sauce')
  await page.getByRole('button', { name: /^Estimate/i }).first().click()

  // Named for what actually happened. "Something went wrong" would be true of
  // a refusal, a timeout and a bad reply alike, and useless in all three.
  await expect(page.getByText('Could not reach the analysis service'))
    .toBeVisible({ timeout: 20_000 })

  // What you typed survives the failure — retyping it would be the insult —
  // and both ways on are offered rather than just an apology.
  await expect(page.getByText(/still here — retry, or/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'log it by hand' })).toBeVisible()
  await expect(page.locator('main')).toContainText('a bowl of pasta with tomato sauce')
})

test('a session that ended mid-analysis: sign in again, and the photo is still there', async ({ page }) => {
  await signIn(page, { trialUsed: 1, analysis: 'expired', consented: true })
  await openSignedIn(page, '/log')
  await page.setInputFiles('input[type=file]', 'e2e/fixtures-meal.jpg')

  await expect(page.getByText('You were signed out, so the analysis did not run. Nothing was counted.'))
    .toBeVisible({ timeout: 20_000 })
  await page.getByRole('link', { name: 'Sign in again' }).click()

  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter the code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()

  // Back where the photo was taken, with it, and with a way to run it again.
  await expect(page).toHaveURL(/\/log$/)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Discard photo' })).toBeVisible()
  await expect(page.getByText(/Your photo and details are still here/)).toBeVisible()
})

test('after signing in, only a path inside the app is followed', async ({ page }) => {
  await stubSupabase(page, { consented: true })
  await page.goto('/signin?next=//evil.example')
  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter the code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  await expect(page).toHaveURL(/\/today$/)
})
