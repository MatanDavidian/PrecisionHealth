import { expect, test, type Page } from '@playwright/test'
import { openSignedIn, signIn } from './supabase'

/**
 * Subscribing inside the Android app, through Google Play (docs/ANDROID-APP.md,
 * step 4).
 *
 * The Android app is this site in a Trusted Web Activity, starting at
 * `/?source=twa`. Chrome gives it Play through the Digital Goods and Payment
 * Request APIs, which exist only there — so both are faked here, as Play
 * would answer: an Israeli price, a purchase sheet, a purchase token.
 *
 * Play's rule is the point of half these checks: inside the Play app, the
 * plan is never sold or managed through Lemon Squeezy.
 */

async function fakePlay(page: Page, options: { available?: boolean; owned?: string[]; closeSheet?: boolean } = {}) {
  await page.addInitScript((given) => {
    const w = window as unknown as Record<string, unknown>
    w.__paymentRequests = []
    if (given.available === false) return
    w.getDigitalGoodsService = async (method: string) => {
      if (method !== 'https://play.google.com/billing') throw new Error('unsupported')
      return {
        getDetails: async (ids: string[]) =>
          ids.map((itemId) => ({ itemId, title: 'Vimetry Monthly', price: { currency: 'ILS', value: '33.90' } })),
        listPurchases: async () => (given.owned ?? []).map((purchaseToken) => ({ itemId: 'vimetry_monthly', purchaseToken })),
      }
    }
    w.PaymentRequest = class {
      constructor(methods: unknown, details: unknown) {
        ;(w.__paymentRequests as unknown[]).push({ methods, details })
      }
      async show() {
        if (given.closeSheet) throw new DOMException('Closed', 'AbortError')
        return {
          details: { purchaseToken: 'play-token-e2e' },
          complete: async (result: string) => {
            w.__completed = result
          },
        }
      }
    }
  }, options)
}

const inApp = '/settings?tab=ai&source=twa'
const requests = (page: Page) =>
  page.evaluate(() => (window as unknown as { __paymentRequests: { methods: { supportedMethods: string; data: { sku: string } }[] }[] }).__paymentRequests)

test('in the Android app, Subscribe opens Google Play at Play’s local price', async ({ page }) => {
  await fakePlay(page)
  const tables = await signIn(page, { trialUsed: 10 })
  await openSignedIn(page, inApp)

  const subscribe = page.getByRole('button', { name: /^Subscribe — ₪33\.90/ })
  await expect(subscribe).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Payment is handled by Google Play/)).toBeVisible()
  await expect(page.getByText(/Lemon Squeezy/)).toHaveCount(0)
  await subscribe.click()

  await expect(page.getByText(/Vimetry Monthly · renews on/)).toBeVisible({ timeout: 15_000 })
  const [sheet] = await requests(page)
  expect(sheet.methods[0]).toMatchObject({ supportedMethods: 'https://play.google.com/billing', data: { sku: 'vimetry_monthly' } })
  // Reported to the server, which confirms it with Play — and Lemon Squeezy never asked.
  expect(tables.billing).toEqual(['play:play-token-e2e'])
  expect(await page.evaluate(() => (window as unknown as { __completed?: string }).__completed)).toBe('success')
})

test('closing Play’s sheet is not an error', async ({ page }) => {
  await fakePlay(page, { closeSheet: true })
  const tables = await signIn(page, { trialUsed: 10 })
  await openSignedIn(page, inApp)
  await page.getByRole('button', { name: /^Subscribe/ }).click()
  await expect(page.getByRole('button', { name: /^Subscribe/ })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(tables.billing).toEqual([])
})

test('already subscribed on the website: said so, and Play refunds the duplicate', async ({ page }) => {
  await fakePlay(page)
  await signIn(page, { trialUsed: 10, play: 'already' })
  await openSignedIn(page, inApp)
  await page.getByRole('button', { name: /^Subscribe/ }).click()
  await expect(page.getByRole('alert')).toHaveText('You already have a subscription.')
  expect(await page.evaluate(() => (window as unknown as { __completed?: string }).__completed)).toBe('fail')
})

test('an old Chrome in the app cannot buy, and is never sent to the website to pay', async ({ page }) => {
  await fakePlay(page, { available: false })
  const tables = await signIn(page, { trialUsed: 10 })
  await openSignedIn(page, inApp)
  await expect(page.getByText(/Subscribing in the app needs an up-to-date Chrome/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Subscribe/ })).toHaveCount(0)
  expect(tables.billing).toEqual([])
})

test('a subscription bought on the website is not managed from inside the app', async ({ page }) => {
  await fakePlay(page)
  await signIn(page, { trialUsed: 10, subscription: {} })
  await openSignedIn(page, inApp)
  await expect(page.getByText(/bought on the Vimetry website, so it is managed there/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Manage subscription' })).toHaveCount(0)
})

test('one bought on Google Play is managed on Google Play — from the website too', async ({ page }) => {
  await signIn(page, { trialUsed: 10, subscription: { provider: 'google_play' } })
  await openSignedIn(page, '/settings?tab=ai')
  await expect(page.getByText('Change your card, cancel, or see receipts — on Google Play.')).toBeVisible({ timeout: 15_000 })
})

test('on start, a purchase the app never reported is reported', async ({ page }) => {
  await fakePlay(page, { owned: ['play-token-left-behind'] })
  const tables = await signIn(page, { trialUsed: 10 })
  await openSignedIn(page, inApp)
  await expect.poll(() => tables.billing).toContain('play:play-token-left-behind')
  await expect(page.getByText(/Vimetry Monthly · renews on/)).toBeVisible({ timeout: 15_000 })
})

test('on the website, nothing changes: Lemon Squeezy as before', async ({ page }) => {
  await fakePlay(page)
  await signIn(page, { trialUsed: 10 })
  await openSignedIn(page, '/settings?tab=ai')
  await expect(page.getByRole('button', { name: 'Subscribe — US$8.99 a month' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Lemon Squeezy, our merchant of record/)).toBeVisible()
})
