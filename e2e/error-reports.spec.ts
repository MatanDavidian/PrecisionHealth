import { expect, test, type Page } from '@playwright/test'
import { dayKey, open } from './app'

/**
 * When the app breaks in someone's browser, we hear about it — and hear
 * nothing personal. The report-error endpoint is stubbed here and its
 * requests read: what left the browser is the thing being tested.
 */

async function collectReports(page: Page) {
  const reports: Record<string, unknown>[] = []
  await page.route('**/functions/v1/report-error', async (route) => {
    reports.push(route.request().postDataJSON())
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
  })
  return reports
}

test('an uncaught error is reported once, with the page and build but nothing personal', async ({ page }) => {
  await open(page, `/nutrition?d=${dayKey(0)}`)
  const reports = await collectReports(page)
  await expect(page.getByRole('button', { name: 'Add meal' })).toBeVisible({ timeout: 15_000 })

  // As the browser raises it for an uncaught error in the app's own script.
  // (A throw from Playwright's injected script arrives as a muted, cross-origin
  // "Script error.", which the reporter deliberately ignores.)
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const error = new Error('meal list failed for someone@example.com')
      window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }))
    })
  }

  await expect.poll(() => reports.length).toBe(1)
  const [report] = reports
  expect(report.kind).toBe('error')
  expect(report.message).toBe('meal list failed for <email>')
  // The path, not the date in the query.
  expect(report.route).toBe('/nutrition')
  expect(typeof report.version).toBe('string')
  expect(JSON.stringify(report)).not.toContain('someone@example.com')
  expect(JSON.stringify(report)).not.toContain(dayKey(0))
})

test('an unhandled rejection is reported too', async ({ page }) => {
  await open(page, '/today')
  const reports = await collectReports(page)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() => {
    void Promise.reject(new Error('sync gave up'))
  })
  await expect.poll(() => reports.map((r) => `${r.kind}: ${r.message}`)).toEqual(['rejection: sync gave up'])
})

test('something the Content Security Policy blocks is reported, by origin only', async ({ page }) => {
  await open(page, '/today')
  const reports = await collectReports(page)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  // A real violation: a policy added to the page, then an image it forbids —
  // as Cloudflare's injected analytics script was blocked in production.
  await page.evaluate(() => {
    const meta = document.createElement('meta')
    meta.httpEquiv = 'Content-Security-Policy'
    meta.content = "img-src 'self'"
    document.head.append(meta)
    const image = document.createElement('img')
    image.src = 'https://tracker.example/pixel.gif?user=someone@example.com'
    document.body.append(image)
  })
  await expect.poll(() => reports.map((r) => r.message))
    .toEqual(['Content Security Policy blocked https://tracker.example (img-src)'])
  expect(JSON.stringify(reports)).not.toContain('someone')
})

test('cross-origin noise is not reported', async ({ page }) => {
  await open(page, '/today')
  const reports = await collectReports(page)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('from a script that is not ours')
    })
  })
  await page.waitForTimeout(500)
  expect(reports).toHaveLength(0)
})

test('a flood of distinct errors stops at five per page', async ({ page }) => {
  await open(page, '/today')
  const reports = await collectReports(page)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      const error = new Error(`distinct failure ${'abcdefghijklmnopqrst'[i]}`)
      window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }))
    }
  })
  await page.waitForTimeout(500)
  expect(reports).toHaveLength(5)
})
