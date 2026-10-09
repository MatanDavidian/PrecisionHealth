import { expect, test, type Page } from '@playwright/test'
import { LEMON_CHECKOUT, LEMON_PORTAL, openSignedIn, signIn } from './supabase'

/**
 * The subscription, from the person's side: being offered it when the trial
 * ends, paying on Lemon Squeezy, coming back, seeing the month's balance, and
 * being told plainly when a month's allowance runs out.
 *
 * Lemon Squeezy and its webhook are stubbed (e2e/supabase.ts); what the
 * webhook stores is proved by supabase/test/lemonsqueezy-webhook.ts, and what
 * the server allows by supabase/test/estimate-food.ts. This is the screen on
 * top of them.
 */

async function openPlan(page: Page) {
  await openSignedIn(page, '/settings?tab=ai')
  await expect(page.getByText('Subscription', { exact: true })).toBeVisible({ timeout: 15_000 })
}

test('when the trial is spent, the plan is offered and leads to Lemon Squeezy', async ({ page }) => {
  const tables = await signIn(page, { trialUsed: 10 })
  await openPlan(page)

  await expect(page.getByText(/100 photo analyses and 200 written ones a month/)).toBeVisible()
  await expect(page.getByText(/Your card never reaches this app/)).toBeVisible()
  await page.getByRole('button', { name: 'Subscribe — US$8.99 a month' }).click()

  await page.waitForURL(LEMON_CHECKOUT)
  await expect(page.getByRole('heading', { name: /Lemon Squeezy/ })).toBeVisible()
  expect(tables.billing).toEqual(['checkout'])
})

test('if payments are down, it says so instead of a broken page', async ({ page }) => {
  await signIn(page, { trialUsed: 10, billing: 'down' })
  await openPlan(page)
  await page.getByRole('button', { name: /^Subscribe/ }).click()
  await expect(page.getByRole('alert')).toHaveText(/Payments are not available right now/)
  await expect(page).toHaveURL(/\/settings/)
})

test('a subscriber sees this month’s balance, the reset date, and the model choice', async ({ page }) => {
  // The trial is long gone — the plan is what keeps the model picker here.
  const tables = await signIn(page, { trialUsed: 10, subscription: {}, planUsed: { PHOTO: 37, TEXT: 12 } })
  await openPlan(page)

  await expect(page.getByText(/Vimetry Monthly · renews on/)).toBeVisible()
  await expect(page.getByText('Photo analyses: 37 of 100 used this month')).toBeVisible()
  await expect(page.getByText('Written analyses: 12 of 200 used this month')).toBeVisible()
  await expect(page.getByText(/Both start again on/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Subscribe/ })).toHaveCount(0)
  await expect(page.locator('select[name="trialModel"]')).toHaveValue('gpt-6.1-sol')

  await page.getByRole('button', { name: 'Manage subscription' }).click()
  await page.waitForURL(LEMON_PORTAL)
  expect(tables.billing).toEqual(['portal'])
})

test('cancelled, it stays until the end of the paid month and says until when', async ({ page }) => {
  await signIn(page, { trialUsed: 10, subscription: { status: 'cancelled', endsInDays: 5 } })
  await openPlan(page)
  await expect(page.getByText(/Vimetry Monthly · cancelled — yours until/)).toBeVisible()
  await expect(page.getByText(/Both start again on/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Manage subscription' })).toBeVisible()
})

test('a failing payment is flagged, with where to fix it', async ({ page }) => {
  await signIn(page, { trialUsed: 10, subscription: { status: 'past_due' } })
  await openPlan(page)
  await expect(page.getByText(/Your last payment did not go through/)).toBeVisible()
})

test('back from checkout before the webhook: thanked, and not offered a second purchase', async ({ page }) => {
  await signIn(page, { trialUsed: 10 })
  await openSignedIn(page, '/settings?billing=success')
  await expect(page.getByRole('status')).toHaveText(/Thank you! Your subscription will appear here/, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Subscribe/ })).toBeDisabled()
})

test('back from checkout after the webhook: the plan shows and the marker goes', async ({ page }) => {
  await signIn(page, { trialUsed: 10, subscription: {} })
  await openSignedIn(page, '/settings?billing=success')
  await expect(page.getByText(/Vimetry Monthly · renews on/)).toBeVisible({ timeout: 15_000 })
  await expect(page).not.toHaveURL(/billing=success/)
})

test('the trial’s last analysis offers the subscription first', async ({ page }) => {
  await signIn(page, { trialUsed: 9, analysis: 'exhausted' })
  await openSignedIn(page, '/log')
  await page.locator('#log-mode-write').click()
  await page.locator('main textarea').first().fill('two eggs on toast and a black coffee')
  await page.getByRole('button', { name: /^Estimate/i }).first().click()

  await expect(page.getByText('That was the last one on us')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('link', { name: 'Subscribe — US$8.99 a month' }).click()
  await expect(page.getByText('Subscription', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Subscribe/ })).toBeVisible()
})

test('signed in with the trial spent, the setup card offers the plan beside a key', async ({ page }) => {
  await signIn(page, { trialUsed: 10 })
  await openSignedIn(page, '/log')
  await expect(page.getByRole('link', { name: 'Subscribe — US$8.99 a month' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Add API key' })).toBeVisible()
})

test('a subscriber is never asked for a key', async ({ page }) => {
  await signIn(page, { trialUsed: 10, subscription: {} })
  await openSignedIn(page, '/log')
  await page.locator('#log-mode-write').click()
  await expect(page.locator('main textarea').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add API key' })).toHaveCount(0)
})

test('a month’s written analyses running out is named, with when they return', async ({ page }) => {
  await signIn(page, { trialUsed: 10, subscription: {}, analysis: 'planExhausted' })
  await openSignedIn(page, '/log')
  await page.locator('#log-mode-write').click()
  await page.locator('main textarea').first().fill('a bowl of pasta with tomato sauce')
  await page.getByRole('button', { name: /^Estimate/i }).first().click()

  await expect(page.getByText('This month’s written analyses are used')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Your plan includes 200 a month, and they start again on/)).toBeVisible()
  // Not the trial's message: this person has paid.
  await expect(page.getByText('That was the last one on us')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Log by hand instead' })).toBeVisible()
  await expect(page.locator('main')).toContainText('a bowl of pasta with tomato sauce')
})
