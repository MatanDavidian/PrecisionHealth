// Renders each screen's HTML to ../NN-name.png at phone width.
import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 })
for (const file of readdirSync(here).filter((f) => f.endsWith('.html'))) {
  await page.goto('file://' + join(here, file))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(here, '..', file.replace('.html', '.png')), fullPage: true })
}
await browser.close()
