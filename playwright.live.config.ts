import { defineConfig, devices } from '@playwright/test'

/**
 * Checks against the LIVE site, after a deploy. `npm run check:live`.
 *
 * Kept out of the main suite on purpose. That suite runs a local build against
 * demo data and must never depend on a network; this one exists only to ask
 * the question the main suite cannot — is what people are actually being
 * served the code that was pushed, and does it start?
 *
 * Read-only: page loads and GETs. It signs nobody in and writes nothing.
 *
 * Point it elsewhere with LIVE_URL, e.g. a Pages preview deployment.
 */
export default defineConfig({
  testDir: './e2e-live',
  reporter: 'list',
  retries: 0,
  use: {
    baseURL: process.env.LIVE_URL ?? 'https://vimetry.app',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
})
