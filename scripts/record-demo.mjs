/**
 * Records a demo video of the LIVE app, for payment-provider review and the like.
 *
 *   node scripts/record-demo.mjs <out-dir> <meal-photo.jpg>
 *
 * Signs in as the TEST account from .env.local (never the owner's real one),
 * and every analysis in the video is a real call to the deployed model — the
 * fake estimator the e2e suite uses would be a misrepresentation here. Each
 * take therefore spends two of the test account's trial analyses.
 *
 * Captions and tap marks are drawn over the page by this script and are not
 * part of the app; the test account's email is blurred where it appears.
 */
import { chromium, devices } from '@playwright/test'
import { mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const [OUT = 'demo-video', PHOTO] = process.argv.slice(2)
if (!PHOTO) throw new Error('usage: node scripts/record-demo.mjs <out-dir> <meal-photo.jpg>')
const SITE = process.env.DEMO_URL ?? 'https://vimetry.app'
mkdirSync(OUT, { recursive: true })

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
)
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]

async function testAccountSession() {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.SUPABASE_TEST_EMAIL, password: env.SUPABASE_TEST_PASSWORD }),
  })
  const session = await response.json()
  if (!session.access_token) throw new Error(`test account sign-in failed: ${response.status}`)
  if (session.user.id === '03272ea5-9d10-4610-a2b7-f2660fc006e7') {
    throw new Error('refusing: .env.local points at the real account, not the test account')
  }
  return session
}

/** Captions, tap marks, title cards and the email blur — drawn over the page, not part of it. */
function overlay() {
  const TITLE = `<div class="dot"></div><h1>Vimetry</h1><p>A personal health log — nutrition, activity and recovery in one place.</p><p style="font-size:14px">The live app at vimetry.app. Every estimate in this video is a real analysis.</p>`
  /*
    Onboarding hints a returning user has long since dismissed. Left in, the
    trial-model notice sat at the top of every Log frame talking about the
    test account's own trial.
  */
  for (const id of ['model-tradeoff', 'switched-to-terra']) {
    try { localStorage.setItem(`notice-seen:${id}`, '2026-10-01T00:00:00.000Z') } catch {}
  }
  const css = `
    .demo-caption { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%) translateY(8px);
      z-index: 2147483647; width: max-content; max-width: 360px; padding: 11px 17px; border-radius: 14px;
      background: rgba(30, 27, 23, 0.93); color: #fff; font: 500 15px/1.4 Inter, system-ui, sans-serif;
      text-align: center; opacity: 0; transition: opacity .35s, transform .35s; pointer-events: none;
      box-shadow: 0 10px 30px rgba(0,0,0,.25); }
    .demo-caption.on { opacity: 1; transform: translateX(-50%) translateY(0); }
    .demo-tap { position: fixed; z-index: 2147483647; width: 38px; height: 38px; margin: -19px 0 0 -19px;
      border-radius: 50%; border: 3px solid rgba(194, 103, 62, .95); background: rgba(194, 103, 62, .18);
      pointer-events: none; animation: demo-tap .65s ease-out forwards; }
    @keyframes demo-tap { from { transform: scale(.5); opacity: 1 } to { transform: scale(1.5); opacity: 0 } }
    .demo-card { position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px; padding: 32px; background: #f1ece1;
      color: #2b2721; text-align: center; font-family: Inter, system-ui, sans-serif; transition: opacity .4s; }
    .demo-card h1 { font: 500 46px/1.1 Fraunces, Georgia, serif; margin: 0; }
    .demo-card p { font-size: 17px; line-height: 1.5; margin: 0; color: #6b6458; max-width: 330px; }
    .demo-card .dot { width: 34px; height: 34px; border-radius: 50%; background: #c2673e; }
    .demo-blur { filter: blur(7px); }
  `
  const install = () => {
    if (document.getElementById('demo-style')) return
    const style = Object.assign(document.createElement('style'), { id: 'demo-style', textContent: css })
    document.head.append(style)
    const caption = Object.assign(document.createElement('div'), { className: 'demo-caption' })
    document.body.append(caption)
    window.__caption = (text) => {
      caption.classList.remove('on')
      if (!text) return
      setTimeout(() => { caption.textContent = text; caption.classList.add('on') }, 120)
    }
    window.__card = (html) => {
      document.getElementById('demo-card')?.remove()
      if (!html) return
      const card = Object.assign(document.createElement('div'), { id: 'demo-card', className: 'demo-card', innerHTML: html })
      document.body.append(card)
    }
    // The title is up from the very first frame, so the video does not open on
    // a blank page while the site loads.
    if (!sessionStorage.getItem('demo-titled')) {
      sessionStorage.setItem('demo-titled', '1')
      window.__card(TITLE)
    }
    document.addEventListener('pointerdown', (event) => {
      const tap = Object.assign(document.createElement('div'), { className: 'demo-tap' })
      tap.style.left = `${event.clientX}px`
      tap.style.top = `${event.clientY}px`
      document.body.append(tap)
      setTimeout(() => tap.remove(), 700)
    }, true)
    // The test account's address is not something to put in a video.
    const blur = () => {
      for (const el of document.querySelectorAll('p, span, div')) {
        if (el.children.length === 0 && /Signed in as|@gmail\.com/.test(el.textContent ?? '')) el.classList.add('demo-blur')
      }
    }
    new MutationObserver(blur).observe(document.body, { childList: true, subtree: true, characterData: true })
    blur()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install)
  else install()
}

const session = await testAccountSession()
const browser = await chromium.launch()
const contextFor = (video) =>
  browser.newContext({
    ...devices['Pixel 7'],
    // Below the app's 768px breakpoint, so it is the phone layout — and the
    // video is recorded at exactly this size. A larger video size does not
    // scale the page up; it pads it, which left three quarters of every frame
    // grey in the first take.
    viewport: { width: 540, height: 1170 },
    locale: 'en-US',
    timezoneId: 'Asia/Jerusalem',
    acceptDownloads: true,
    ...(video ? { recordVideo: { dir: OUT, size: { width: 540, height: 1170 } } } : {}),
  })
const signIn = (context) =>
  context.addInitScript(
    ([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value) },
    [`sb-${ref}-auth-token`, JSON.stringify(session)],
  )

/* ---------- setup, not recorded: a clean "today" for this take ---------- */
{
  const context = await contextFor(false)
  await signIn(context)
  const page = await context.newPage()
  await page.goto(`${SITE}/nutrition`)
  await page.getByRole('button', { name: 'Add meal' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  for (let i = 0; i < 20; i += 1) {
    const remove = page.getByRole('button', { name: /^Delete / }).first()
    if (!(await remove.isVisible().catch(() => false))) break
    await remove.click()
    await page.waitForTimeout(1200)
  }
  await context.close()
}

/* ---------- the take ---------- */
const context = await contextFor(true)
await signIn(context)
await context.addInitScript(overlay)
const page = await context.newPage()
const pause = (ms) => page.waitForTimeout(ms)
const caption = async (text, hold = 0) => { await page.evaluate((t) => window.__caption?.(t), text); if (hold) await pause(hold) }
const card = (html) => page.evaluate((h) => window.__card?.(h), html)
const scroll = async (dy, steps = 8) => { for (let i = 0; i < steps; i += 1) { await page.mouse.wheel(0, dy / steps); await pause(60) } }
const nav = (name) => page.getByRole('link', { name, exact: true }).last().click()

/** Waits out a real analysis, skips its question if it asks one, and leaves the estimate on screen. */
async function untilEstimate() {
  const skip = page.getByRole('button', { name: /^Skip/ })
  const save = page.getByRole('button', { name: 'Save meal' })
  try {
    await Promise.race([skip.waitFor({ timeout: 120_000 }), save.waitFor({ timeout: 120_000 })])
  } catch (error) {
    await page.screenshot({ path: join(OUT, 'failure.png') })
    console.error('ON SCREEN:', (await page.locator('main').innerText()).slice(0, 900).replace(/\n+/g, ' | '))
    throw error
  }
  if (await skip.isVisible()) {
    await caption('If one detail would change the numbers, it asks — answering is optional', 4200)
    await skip.click()
    await save.waitFor({ timeout: 30_000 })
  }
}

await page.goto(`${SITE}/today`)
await page.getByRole('heading', { name: 'Today' }).waitFor({ timeout: 30_000 })
// The title card is already up (drawn from the first paint); hold it, then reveal the app.
await pause(1800)
await card('')
await caption("Today: what you've eaten, burned and slept, from what you log", 3600)

// 1 — a photograph
await nav('Log')
await page.locator('input[type=file]').waitFor({ state: 'attached' })
await caption('Photograph a meal', 2600)
await page.locator('input[type=file]').setInputFiles(PHOTO)
/*
  A photo can be held for a tap rather than sent — the app holds whenever it
  does not yet know the person's auto-send preference. Press the button a
  person would press, rather than racing the setting.
*/
const analyze = page.getByRole('button', { name: 'Analyze this photo' })
if (await analyze.isVisible({ timeout: 2500 }).catch(() => false)) {
  await pause(800)
  await analyze.click()
}
await caption('The AI model reads the plate…', 0)
await untilEstimate()
await caption('Each food, its portion and macros — and how sure the model is of each', 3800)
await scroll(320)
await pause(1800)
await page.getByRole('button', { name: 'Adjust these numbers' }).click()
await pause(900)
const grams = page.getByRole('spinbutton').first()
const before = Number(await grams.inputValue())
await caption('Wrong portion? Correct it before saving — calories and macros follow', 1500)
await grams.fill(String(Math.max(10, Math.round((before * 0.7) / 10) * 10)))
await grams.press('Enter')
await pause(3200)
await page.getByRole('button', { name: 'Save meal' }).click()
await caption('Saved', 1600)

// 2 — in words
await page.locator('#log-mode-write').click()
await caption('No photo? Describe it in words', 1200)
const box = page.locator('main textarea').first()
await box.click()
await box.pressSequentially('Greek yogurt with honey, a banana and a black coffee', { delay: 45 })
await pause(600)
await page.getByRole('button', { name: /^Estimate/i }).first().click()
await caption('Same model, same honesty about what it is sure of', 0)
await untilEstimate()
await pause(2600)
await page.getByRole('button', { name: 'Save meal' }).click()
await caption('Saved', 1400)

// 3 — the day
await nav('Nutrition')
await caption('The day: every meal, and the totals', 3400)
await scroll(450)
await pause(2600)

// 4 — the week
await nav('Today')
await page.getByRole('button', { name: 'Week', exact: true }).click()
// The gaps card sits at the top of the week, so it is captioned while it is on screen.
await caption('Missed a day? Fill it from your average — always marked as an estimate', 4400)
await scroll(560)
await caption('The week: eaten against burned, against your goal', 4000)
await scroll(420)
await pause(2000)

// 5 — your data
await nav('Settings')
await page.getByRole('button', { name: 'Account & data' }).click()
await caption('Your data is yours: download all of it, any time', 1500)
const download = page.getByRole('button', { name: 'Download my data' })
await download.scrollIntoViewIfNeeded()
await pause(1500)
const downloading = page.waitForEvent('download')
await download.click()
await downloading
await pause(2400)
await caption('')

// 6 — the plan
await card(`<div class="dot"></div><h1>Vimetry</h1><p><b>Free</b> — 10 AI meal analyses, no card needed. Logging by hand, the week view and data export are always free.</p><p><b>Vimetry Monthly</b> — US$8.99 a month, 100 AI meal analyses. Cancel any time.</p><p style="font-size:15px">vimetry.app</p>`)
await pause(5500)

const video = page.video()
await context.close()
await browser.close()
const target = join(OUT, 'vimetry-demo.webm')
renameSync(await video.path(), target)
console.log(target)
