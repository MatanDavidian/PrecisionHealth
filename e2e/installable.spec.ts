import { expect, test } from '@playwright/test'
import { open } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * vimetry.app as an installed app (docs/ANDROID-APP.md, step 1): the service
 * worker registers, the app opens offline, and it keeps its hands off other
 * origins — which is where people's data travels.
 *
 * Service workers are blocked in every other spec (playwright.config.ts);
 * here they are on, as they are for real visitors.
 */
test.use({ serviceWorkers: 'allow' })

const workerReady = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return Boolean(registration.active)
  })

test('the manifest is served as a manifest', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest.name).toBe('Vimetry')
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true)
})

test('the service worker installs, and the app then opens offline', async ({ page, context }) => {
  await open(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  expect(await workerReady(page)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  // Signed out, the data is in this browser, so the whole day is there offline.
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await page.goto('/nutrition')
  await expect(page.getByRole('button', { name: 'Add meal' })).toBeVisible({ timeout: 15_000 })
  await context.setOffline(false)
})

test('signed in, requests to Supabase go past the worker untouched', async ({ page }) => {
  // The stubs answer at the network; if the worker swallowed or cached these
  // requests, sign-in and the day would not load.
  await signIn(page)
  await openSignedIn(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  expect(await workerReady(page)).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
})
