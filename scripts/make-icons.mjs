// Renders every app icon from one mark.
//
//   node scripts/make-icons.mjs
//
// The mark is the favicon's orange dot on cream — a stand-in until the logo
// exists (PHASE-1-FINISH, "Logo and home-screen icon"). Replace MARK and run
// this again; every size follows. Rendered by Playwright's Chromium, which is
// already installed for the browser tests, so there is no image tool to add.
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const CREAM = '#f1ece1'
const ORANGE = '#c2673e'

/** The mark alone, centred, `scale` = the dot's radius as a share of the side. */
const MARK = (scale) => `<circle cx="50" cy="50" r="${scale * 100}" fill="${ORANGE}"/>`

const svg = {
  // "any": a rounded tile, as the favicon is.
  any: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="22" fill="${CREAM}"/>${MARK(0.25)}</svg>`,
  // "maskable" and stores: full bleed — the platform cuts its own shape, and
  // anything outside the central 80% may be cut off.
  full: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${CREAM}"/>${MARK(0.22)}</svg>`,
}

const outputs = [
  ['public/icons/icon-192.png', svg.any, 192],
  ['public/icons/icon-512.png', svg.any, 512],
  ['public/icons/maskable-192.png', svg.full, 192],
  ['public/icons/maskable-512.png', svg.full, 512],
  // iOS rounds the corners itself, and draws transparency black.
  ['public/icons/apple-touch-icon.png', svg.full, 180],
  // Google Play's store icon: 512×512, no transparency, Play applies the mask.
  ['public/icons/play-store-512.png', svg.full, 512],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [path, markup, size] of outputs) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>
    </body></html>`)
  const png = await page.locator('div').screenshot({ omitBackground: true })
  writeFileSync(path, png)
  console.log(`${path} ${size}×${size}`)
}
await browser.close()
