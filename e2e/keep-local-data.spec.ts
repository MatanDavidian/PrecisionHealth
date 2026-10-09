import { expect, test, type Page } from '@playwright/test'
import { open } from './app'

/**
 * Signed out, this browser is the only copy — and browsers may clear it.
 * Safari does after seven days without a visit. So the app asks the browser
 * to keep it (navigator.storage.persist) once there is something worth
 * keeping, and Settings says plainly whether the browser agreed.
 *
 * The browser's answer is the one input a test cannot get from Chromium on
 * demand, so `navigator.storage` is replaced with a recorder that answers as
 * told.
 */

async function browserWillKeep(page: Page, answer: { persisted: boolean; persist: boolean }) {
  await page.addInitScript((given) => {
    const calls: string[] = []
    ;(window as unknown as { __storageCalls: string[] }).__storageCalls = calls
    let kept = given.persisted
    const storage = navigator.storage
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: () => storage.estimate(),
        persisted: async () => {
          calls.push('persisted')
          return kept
        },
        persist: async () => {
          calls.push('persist')
          kept = given.persist
          return kept
        },
      },
    })
  }, answer)
}

const persistCalls = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __storageCalls: string[] }).__storageCalls.filter((c) => c === 'persist').length,
  )

async function openStorage(page: Page) {
  await open(page, '/settings?tab=account')
  await expect(page.getByText('Where your data is saved')).toBeVisible({ timeout: 15_000 })
}

test('a browser that may clear the data says so, with the sure ways to keep it', async ({ page }) => {
  await browserWillKeep(page, { persisted: false, persist: true })
  await openStorage(page)
  await expect(page.getByText(/Safari does after seven days without a visit/)).toBeVisible()
  await expect(page.getByText(/sign in, add Vimetry to your Home Screen, or export it/)).toBeVisible()

  await page.getByRole('button', { name: 'Ask the browser to keep it' }).click()
  await expect(page.getByText('This browser has agreed to keep it — it will not clear it on its own.')).toBeVisible()
})

test('if the browser says no, the person is told the sure way', async ({ page }) => {
  await browserWillKeep(page, { persisted: false, persist: false })
  await openStorage(page)
  await page.getByRole('button', { name: 'Ask the browser to keep it' }).click()
  await expect(page.getByRole('status')).toHaveText(/The browser said not yet/)
})

test('a browser that already keeps it is not asked again', async ({ page }) => {
  await browserWillKeep(page, { persisted: true, persist: true })
  await openStorage(page)
  await expect(page.getByText(/This browser has agreed to keep it/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ask the browser to keep it' })).toHaveCount(0)
})

test('the first save asks the browser to keep the data — once', async ({ page }) => {
  await browserWillKeep(page, { persisted: false, persist: true })
  await open(page, '/log')
  await page.locator('#log-mode-again').click()
  const usual = page.getByRole('button').filter({ hasText: /\d+ kcal/ })
  await expect(usual.first()).toBeVisible({ timeout: 10_000 })
  await usual.first().click()
  await expect(page.getByText(/logged/i).first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => persistCalls(page)).toBe(1)

  await open(page, '/log')
  await page.locator('#log-mode-again').click()
  await expect(usual.first()).toBeVisible({ timeout: 10_000 })
  await usual.first().click()
  await expect(page.getByText(/logged/i).first()).toBeVisible({ timeout: 15_000 })
  // A fresh page: the recorder starts at zero, and the app remembers it already asked.
  expect(await persistCalls(page)).toBe(0)
})
