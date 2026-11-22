import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { open } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * Reminders, the Settings card (docs/features/reminders.md).
 *
 * A headless browser has no push service to subscribe to, so the page gets
 * a stand-in for the browser's push machinery (permission, subscription),
 * and the `reminders` function is answered here. What is tested is
 * everything of ours: when the card shows, what it asks for, what it
 * saves, and what it sends. The sending itself is tested in
 * supabase/test/send-reminders.ts; the encryption against the reference
 * implementation in src/__tests__/webPush.test.ts.
 */

const DEVICE = 'https://fcm.googleapis.com/fcm/send/e2e-device'

/**
 * The browser's push machinery, faked before the app loads. `answer` is what
 * the permission prompt says. `homeScreen`: on an iPhone, whether the app
 * was opened from the Home Screen, the only place iOS allows push.
 */
async function fakePush(page: Page, answer: 'granted' | 'denied' = 'granted', homeScreen = true) {
  await page.addInitScript(
    ({ endpoint, answer, homeScreen }) => {
      if (homeScreen) Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
      const push = { subscribed: false, permission: 'default' as NotificationPermission, asked: 0 }
      ;(window as unknown as { __push: typeof push }).__push = push
      const subscription = {
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }),
        unsubscribe: async () => {
          push.subscribed = false
          return true
        },
      }
      const registration = {
        pushManager: {
          getSubscription: async () => (push.subscribed ? subscription : null),
          subscribe: async () => {
            push.subscribed = true
            return subscription
          },
        },
      }
      Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          ready: Promise.resolve(registration),
          register: async () => registration,
          getRegistration: async () => registration,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          controller: null,
        },
      })
      class FakeNotification {
        static get permission() {
          return push.permission
        }
        static async requestPermission() {
          push.asked += 1
          push.permission = answer
          return answer
        }
      }
      Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification })
    },
    { endpoint: DEVICE, answer, homeScreen },
  )
}

/** The `reminders` function, answered here; returns what it was asked. */
async function fakeFunction(page: Page, deployed = true) {
  const asked: Record<string, unknown>[] = []
  await page.route('**/functions/v1/reminders', async (route) => {
    if (!deployed) return route.fulfill({ status: 404, body: '{"code":"NOT_FOUND"}' })
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    asked.push(body)
    const reply =
      body.action === 'available'
        ? { available: true }
        : body.action === 'key'
          ? { publicKey: 'B'.repeat(87) }
          : body.action === 'test'
            ? { sent: 1, gone: 0, failed: 0 }
            : { ok: true }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(reply),
    })
  })
  return asked
}

const card = (page: Page) => page.locator('#reminders')
const mealSwitch = (page: Page) => page.getByRole('switch', { name: 'End of the day, if nothing is logged' })

test('signed out, the card says reminders need an account', async ({ page }) => {
  await fakeFunction(page)
  await open(page, '/settings?tab=reminders')
  await expect(page.getByText(/Reminders come from our server/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Sign in' }).last()).toHaveAttribute('href', '/signin?next=/settings')
})

test('before the server side is deployed, there is no Reminders tab at all', async ({ page }) => {
  await fakeFunction(page, false)
  await open(page, '/settings?tab=reminders')
  // Asked for the Reminders tab, it opens on Goals instead.
  await expect(page.getByRole('button', { name: 'Goals' })).toHaveAttribute('aria-current', 'page', { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Reminders' })).toHaveCount(0)
  await expect(card(page)).toHaveCount(0)
})

test('turning the reminder on asks this device, subscribes it, and saves the choice', async ({ page }) => {
  await fakePush(page)
  const tables = await signIn(page, { keep: true })
  const asked = await fakeFunction(page)
  await openSignedIn(page, '/settings?tab=reminders')

  await expect(mealSwitch(page)).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 })
  // Off until switched on, at 22:30 unless changed.
  await expect(card(page).getByLabel('At', { exact: true })).toHaveValue('22:30')
  await mealSwitch(page).click()
  await expect(mealSwitch(page)).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })

  expect(await page.evaluate(() => (window as unknown as { __push: { asked: number } }).__push.asked)).toBe(1)
  const subscribe = asked.find((a) => a.action === 'subscribe') as { subscription: { endpoint: string } }
  expect(subscribe.subscription.endpoint).toBe(DEVICE)
  const prefs = tables.user_preferences.at(-1) as Record<string, unknown>
  expect(prefs).toMatchObject({ meal_reminder: true, watch_reminder: false, reminder_time: '22:30' })
  expect(typeof prefs.reminder_zone).toBe('string')

  // A time after midnight, saved as it is.
  await card(page).getByLabel('At', { exact: true }).selectOption('01:00')
  await expect.poll(() => (tables.user_preferences.at(-1) as Record<string, unknown>).reminder_time).toBe('01:00')

  // A test, to see what it looks like.
  await page.getByRole('button', { name: 'Send a test' }).click()
  await expect(page.getByText('Sent. It should arrive in a few seconds.')).toBeVisible()
  expect(asked.some((a) => a.action === 'test' && a.lang === 'en')).toBe(true)
})

test('turning both off stops this device', async ({ page }) => {
  await fakePush(page)
  await signIn(page, { keep: true })
  const asked = await fakeFunction(page)
  await openSignedIn(page, '/settings?tab=reminders')
  await mealSwitch(page).click()
  await expect(mealSwitch(page)).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
  await mealSwitch(page).click()
  await expect(mealSwitch(page)).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 })
  expect(asked.some((a) => a.action === 'unsubscribe' && a.endpoint === DEVICE)).toBe(true)
  expect(await page.evaluate(() => (window as unknown as { __push: { subscribed: boolean } }).__push.subscribed)).toBe(false)
})

test('when the person says no to notifications, nothing is saved and the card says how to allow them', async ({ page }) => {
  await fakePush(page, 'denied')
  const tables = await signIn(page, { keep: true })
  const asked = await fakeFunction(page)
  await openSignedIn(page, '/settings?tab=reminders')
  await mealSwitch(page).click()
  await expect(page.getByRole('alert').filter({ hasText: /Notifications are blocked/ })).toBeVisible({ timeout: 15_000 })
  await expect(mealSwitch(page)).toHaveAttribute('aria-checked', 'false')
  expect(asked.some((a) => a.action === 'subscribe')).toBe(false)
  expect(tables.user_preferences.some((row) => (row as Record<string, unknown>).meal_reminder === true)).toBe(false)
})

test.describe('on an iPhone, in a Safari tab', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  })
  test('it says to add the app to the Home Screen first', async ({ page }) => {
    await fakePush(page, 'granted', false)
    await signIn(page, { keep: true })
    await fakeFunction(page)
    await openSignedIn(page, '/settings?tab=reminders')
    await expect(card(page).getByText(/reminders need Vimetry on your Home Screen/)).toBeVisible({ timeout: 15_000 })
  })
})

test('the card passes an accessibility scan, and reads in Hebrew', async ({ page }) => {
  await fakePush(page)
  await signIn(page, { keep: true })
  await fakeFunction(page)
  await openSignedIn(page, '/settings?tab=reminders')
  await expect(mealSwitch(page)).toBeVisible({ timeout: 15_000 })
  const { violations } = await new AxeBuilder({ page })
    .include('#reminders')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .options({ preload: false })
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])

  // Signed in, the language is chosen at the top of the Account tab.
  await openSignedIn(page, '/settings?tab=account')
  await page.getByRole('button', { name: 'עברית' }).first().click()
  await page.locator('html[dir="rtl"]').waitFor()
  await page.getByRole('button', { name: 'תזכורות' }).click()
  await expect(page.getByRole('switch', { name: 'בסוף היום, אם לא נרשם כלום' })).toBeVisible({ timeout: 15_000 })
  await expect(card(page).getByText('תזכורות', { exact: true })).toBeVisible()
})

test('a lunch reminder: switched on, its own time, and the usual meals saved for its button', async ({ page }) => {
  await fakePush(page)
  const tables = await signIn(page, { keep: true })
  await fakeFunction(page)
  await openSignedIn(page, '/settings?tab=reminders')

  const lunch = page.getByRole('switch', { name: 'Lunch' })
  await expect(lunch).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 })
  await lunch.click()
  await expect(lunch).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
  const latest = () => tables.user_preferences.at(-1) as Record<string, unknown>
  await expect.poll(() => latest().lunch_reminder).toBe(true)
  expect(latest().lunch_time).toBe('13:30')
  // Off by default, the others stay off.
  expect(latest().breakfast_reminder).toBe(false)
  expect(latest().dinner_reminder).toBe(false)

  // Lunch's own time, from lunch's own window.
  const time = page.getByRole('combobox', { name: 'Lunch: At' })
  await expect(time.locator('option').first()).toHaveText('11:00')
  await expect(time.locator('option').last()).toHaveText('16:45')
  await time.selectOption('12:45')
  await expect.poll(() => latest().lunch_time).toBe('12:45')

  // The usual meals for each meal, saved for the buttons (this account has none yet).
  await expect.poll(() => JSON.stringify(Object.keys((latest().reminder_usuals ?? {}) as object))).toBe(
    JSON.stringify(['BREAKFAST', 'LUNCH', 'DINNER']),
  )
})
