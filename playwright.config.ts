import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests, against the production build.
 *
 * Every one of these covers something a unit test structurally cannot see: a
 * hook order, a state update that never landed, a control that moves when you
 * press it, a colour that never rendered. All of those have actually happened
 * here, and none of them were caught by the 330 tests in Vitest.
 *
 * Against `vite preview` rather than the dev server, because the bugs worth
 * catching are the ones that reach a user, and the dev server is not what
 * reaches them.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:4173',
    // Kept only for failures: a trace for every passing test is a slow way to
    // fill a disk.
    trace: 'retain-on-failure',
  },

  /*
    Both shapes, because most of the layout bugs this suite exists to catch
    were bugs in ONE of them. The app switches its whole navigation at `md`
    (768px), so the phone project sits below it and the desktop project above.
  */
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], isMobile: false, hasTouch: false } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 900 } } },
  ],

  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
