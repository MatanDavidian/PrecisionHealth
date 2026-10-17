import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

/**
 * The whole suite on Safari's engine (WebKit) at an iPhone's size — every
 * iPhone browser is WebKit underneath, whatever its name.
 *
 *   npm run test:iphone      (once: npx playwright install webkit)
 *
 * Run by hand rather than in CI: it is a second full browser to download on
 * every run, for a check that matters when the photo or storage code changes.
 *
 * Not run here: installable.spec.ts. Playwright's WebKit cannot take a page
 * offline under a service worker ("internal error" on reload) — a gap in the
 * test browser, not in the app. Real iPhones are the check for that.
 */
export default defineConfig({
  ...base,
  testIgnore: ['**/installable.spec.ts'],
  projects: [{ name: 'iphone', use: { ...devices['iPhone 15'], isMobile: false, hasTouch: false } }],
})
