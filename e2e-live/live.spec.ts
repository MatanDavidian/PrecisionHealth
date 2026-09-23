import { execSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

/**
 * What the live site is serving, and whether it works.
 *
 * Written after a morning spent reasoning about code the site was not
 * running: five commits sat unpushed, the live bundle was the old one, and
 * the only way to find out was to download its JavaScript and grep it.
 */

/** What was last pushed — the commit a finished deploy should be serving. */
const pushed = () =>
  execSync('git rev-parse origin/main', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()

test('the live site serves the commit on origin/main', async ({ request, baseURL }) => {
  const html = await (await request.get('/')).text()
  const served = html.match(/<meta name="build-commit" content="([^"]+)"/)?.[1]

  expect(
    served,
    `${baseURL} has no build-commit tag, so it was built before the tag existed — ` +
      'push, and let Cloudflare Pages build it.',
  ).toBeDefined()

  const expected = pushed()
  expect(
    served,
    `${baseURL} serves ${served?.slice(0, 7)}, but origin/main is ${expected.slice(0, 7)}. ` +
      'Either the deploy is still building (check Cloudflare Pages), or it failed. ' +
      'If you have unpushed commits, `git log origin/main..main` lists them — they are not live.',
  ).toBe(expected)
})

test('the live app starts, and nothing on the page fails to load', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('response', (response) => {
    // Our own files only. A third party having a bad minute is not our deploy.
    const own = new URL(response.url()).origin === new URL(page.url() || response.url()).origin
    if (own && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })

  await page.goto('/today')
  // Signed out, the app opens onto the local sample day — so this proves the
  // bundle ran, routed, opened IndexedDB and rendered, with no account needed.
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({ timeout: 20_000 })
  // Data, not just chrome: the day's numbers were read and drawn.
  await expect(page.getByText(/\d[\d,]* kcal/).first()).toBeVisible()

  expect(errors, errors.join('\n')).toEqual([])
})

test('no secret key is shipped in the live JavaScript', async ({ request }) => {
  /*
    The anon key belongs in the bundle; the service-role key must never be —
    it bypasses row-level security (D16), and a bundle is public. The same for
    an OpenAI key, which belongs only in the function's secrets.
  */
  const html = await (await request.get('/')).text()
  const entries = [...html.matchAll(/src="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1])
  const seen = new Set<string>()
  const queue = [...entries]
  const leaks: string[] = []

  while (queue.length) {
    const path = queue.shift()!
    if (seen.has(path)) continue
    seen.add(path)
    const body = await (await request.get(`/${path}`)).text()
    for (const chunk of body.matchAll(/assets\/[A-Za-z0-9_-]+\.js/g)) queue.push(chunk[0])

    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(body)) leaks.push(`${path}: a Supabase secret key`)
    if (/sk-(proj-)?[A-Za-z0-9_-]{32,}/.test(body)) leaks.push(`${path}: an OpenAI key`)
    // A JWT whose payload says service_role — the legacy form of the same key.
    for (const jwt of body.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      const payload = Buffer.from(jwt[1], 'base64url').toString()
      if (payload.includes('"service_role"')) leaks.push(`${path}: a service_role JWT`)
    }
  }

  expect(seen.size, 'found the bundle to scan').toBeGreaterThan(0)
  expect(leaks, leaks.join('\n')).toEqual([])
})
