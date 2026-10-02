import { expect, test, type Page } from '@playwright/test'
import { dayKey, open } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * The security headers, and that the app lives inside its own policy.
 *
 * The preview server serves `public/_headers` exactly as Cloudflare does (see
 * vite.config.ts), so this runs under the production policy. The CSP ships as
 * report-only first; these tests are what say it is safe to enforce. A
 * violation here is a part of the app the enforced policy would break.
 */

const PHOTO = 'e2e/fixtures-meal.jpg'

/** Collects every CSP violation the page reports, enforced or report-only. */
async function watchForViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { __csp: string[] }).__csp = seen
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}`)
    })
  })
}
const violations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])

test('every response carries the security headers', async ({ request }) => {
  const response = await request.get('/')
  const headers = response.headers()
  expect(headers['content-security-policy-report-only']).toContain("default-src 'self'")
  expect(headers['content-security-policy-report-only']).toContain("frame-ancestors 'none'")
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['strict-transport-security']).toContain('max-age=')
})

test('signed out, the whole app runs inside its content security policy', async ({ page }) => {
  await watchForViolations(page)

  await open(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await open(page, '/today?view=week')
  await expect(page.getByRole('heading', { name: /This week/ })).toBeVisible({ timeout: 15_000 })

  // A photo, read and saved — previews use blob: and data: images.
  await open(page, '/log')
  await page.setInputFiles('input[type=file]', PHOTO)
  const skip = page.getByRole('button', { name: /Skip/i })
  await expect(skip).toBeVisible({ timeout: 20_000 })
  await skip.click()
  await page.getByRole('button', { name: 'Save meal' }).click()

  await open(page, `/nutrition?d=${dayKey(0)}`)
  await expect(page.getByRole('button', { name: 'Add meal' })).toBeVisible({ timeout: 15_000 })
  await open(page, '/settings')
  for (const tab of ['Photo analysis', 'Account & data']) {
    await page.getByRole('button', { name: tab }).click()
  }
  await open(page, '/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()

  expect(await violations(page)).toEqual([])
})

test('signed in, talking to Supabase stays inside the policy too', async ({ page }) => {
  // The account path is the one that reaches another origin: auth, the REST
  // API and functions on the Supabase project, all of which connect-src must allow.
  await watchForViolations(page)
  await signIn(page)
  await openSignedIn(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await openSignedIn(page, '/settings')
  await page.getByRole('button', { name: 'Account & data' }).click()

  expect(await violations(page)).toEqual([])
})
