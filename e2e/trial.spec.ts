import { expect, test } from '@playwright/test'
import { openSignedIn, signIn } from './supabase'

/**
 * The free trial, and what happens when it runs out or the server does not
 * answer.
 *
 * S2.10, and the half of the app that only exists for people who have just
 * arrived: the notices that explain the accuracy trade-off, the budget on the
 * expensive model, and the two states — spent, and unreachable — where an
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

test('the switch to a faster model is announced, not done quietly', async ({ page }) => {
  // Two analyses on the best model is the nudge point; two of four are left.
  await signIn(page, { trialUsed: 2, solUsed: 2 })
  await openSignedIn(page, '/log')

  await expect(page.getByText(/Switched to balanced/i)).toBeVisible()
  await expect(page.getByText(/2 analyses left on the most accurate one/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Change it' })).toBeVisible()
})

test('the picker says how much of the best model is left', async ({ page }) => {
  await signIn(page, { trialUsed: 3, solUsed: 3 })
  await openSignedIn(page, '/settings')
  await page.getByRole('button', { name: 'Photo analysis' }).click()

  await expect(page.getByText('Accuracy or speed')).toBeVisible()
  await expect(page.getByText('1 left')).toBeVisible()
})

test('and locks it once the budget is spent, without locking the app', async ({ page }) => {
  await signIn(page, { trialUsed: 4, solUsed: 4 })
  await openSignedIn(page, '/settings')
  await page.getByRole('button', { name: 'Photo analysis' }).click()

  await expect(page.getByText('used up')).toBeVisible()
  await expect(page.getByText(/Available again with your own key/)).toBeVisible()

  // The expensive model is gone; the faster one is still selectable, so the
  // trial keeps working rather than ending early.
  await expect(page.locator('input[name="trialModel"]:disabled')).toHaveCount(1)
  await expect(page.locator('input[name="trialModel"]:not(:disabled)')).not.toHaveCount(0)
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
