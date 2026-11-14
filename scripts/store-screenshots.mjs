// Phone screenshots for the Google Play listing, in English and Hebrew.
//
//   VITE_ENABLE_FAKE=1 npm run build && npm run preview -- --port 4173 &
//   node scripts/store-screenshots.mjs [out-dir]    (default android/store-screenshots, git-ignored)
//
// The local build's sample day, signed out (`?fake=1` — the browser-test build
// only): no account, no real person's data. The photo-and-estimate screen is
// not here on purpose: the test build pairs a placeholder image with a canned
// answer, and a store screenshot of that would misrepresent the app. Take that
// one on a phone, with a real meal (docs/android/store-listing.md). 1080×1920 (9:16), within Play's
// limits for phone screenshots. The one-time notices are marked seen first,
// so the screens show the app as someone who has used it for a day sees it.
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'android/store-screenshots'
const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
// Lunchtime, so the meal slots and "now" look like the middle of a real day.
const NOON = new Date()
NOON.setHours(13, 10, 0, 0)

const SHOTS = [
  ['1-today', '/today'],
  ['2-log', '/log'],
  ['3-nutrition', '/nutrition'],
  ['4-week', '/today?view=week', 'chart'],
]

const browser = await chromium.launch()
for (const locale of ['en-US', 'he-IL']) {
  const dir = join(OUT, locale)
  mkdirSync(dir, { recursive: true })
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    locale,
    serviceWorkers: 'block',
  })
  await context.addInitScript(() => {
    for (const id of ['model-tradeoff', 'switched-to-terra']) localStorage.setItem(`notice-seen:${id}`, '1')
  })
  const page = await context.newPage()
  await page.clock.install({ time: NOON })
  await page.clock.resume()
  for (const [name, path, action] of SHOTS) {
    await page.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}fake=1`)
    await page.waitForLoadState('networkidle')
    if (action === 'chart') {
      // The chart's card title near the top, so the screen opens on the chart.
      await page.getByText(/^(Eaten against burned|נאכל מול נשרף)$/i).first().evaluate((el) => {
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140)
      })
    }
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(dir, `${name}.png`) })
    console.log(join(dir, `${name}.png`))
  }
  await context.close()
}
// The feature graphic Play shows above the listing: 1024×500, no transparency.
// The name as the app draws it (src/ui/components/Wordmark.tsx): the icon's
// orange dot is the dot of the i — the owner's choice of 2026-10-17.
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } })
  await page.setContent(`<html><head>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400&display=swap" rel="stylesheet">
    </head><body style="margin:0;width:1024px;height:500px;background:#f1ece1;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box">
    <div style="font-family:Fraunces,serif;font-weight:600;font-size:150px;color:#2b2721;line-height:1;letter-spacing:-0.01em">V<span style="position:relative;display:inline-block">ı<span style="position:absolute;left:calc(50% + 0.045em);top:0.2em;width:0.17em;height:0.17em;transform:translateX(-50%);border-radius:50%;background:#c2673e"></span></span>metry</div>
    <div style="font-family:Inter,sans-serif;font-size:32px;color:#504c45;padding-top:28px;white-space:nowrap">What you eat, beside how you move.</div>
    </body></html>`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: join(OUT, 'feature-graphic.png') })
  console.log(join(OUT, 'feature-graphic.png'))
}
await browser.close()
