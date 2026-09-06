import { expect, test, type Page } from '@playwright/test'
import { open } from './app'

/**
 * Changing a number you already have.
 *
 * The weight stepper wrote a record on every keystroke and every tap, which
 * broke it two ways at once. Typing 73 into a field showing 75.0 sent the
 * first keystroke — `7` — through the clamp and saved it as the 30 kg minimum.
 * And because observations are append-only (D4), nudging 75 → 73 wrote twenty
 * of them, all showing up on Today as competing readings for one morning.
 */

const current = (page: Page) => page.getByRole('spinbutton', { name: 'Current' })
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })

const weightsOnToday = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('timeline-health')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows = await new Promise<{ data: unknown }[]>((resolve, reject) => {
      const request = db.transaction('observations').objectStore('observations').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    const today = new Date().toISOString().slice(0, 10)
    return rows
      .map((row) => row.data as { code: string; time: { at?: string }; provenance: { source: string } })
      .filter((o) => o.code === 'WEIGHT' && o.provenance.source === 'USER' && (o.time.at ?? '').startsWith(today))
      .length
  })

test('typing a weight saves that weight, not the first digit of it', async ({ page }) => {
  await open(page, '/settings')
  await expect(page.getByText(/Last recorded/)).toBeVisible()

  await current(page).fill('73')
  // Nothing is written while you are still typing. Before, `7` had already
  // been saved — clamped up to the 30 kg minimum — and the field had jumped.
  expect(await weightsOnToday(page)).toBe(0)
  await expect(current(page)).toHaveValue('73')

  await save(page).click()
  await expect(current(page)).toHaveValue('73.0')
  expect(await weightsOnToday(page)).toBe(1)

  // And it is the number that was typed.
  await open(page, '/settings')
  await expect(current(page)).toHaveValue('73.0')
})

test('a run of taps is one weigh-in, not twenty', async ({ page }) => {
  await open(page, '/settings')
  await expect(page.getByText(/Last recorded/)).toBeVisible()
  const before = Number(await current(page).inputValue())

  const less = page.getByRole('button', { name: 'Less Current' })
  for (let i = 0; i < 8; i += 1) await less.click()

  // Still nothing written: one weigh-in is one number.
  expect(await weightsOnToday(page)).toBe(0)
  await expect(current(page)).toHaveValue((before - 0.8).toFixed(1))

  await save(page).click()
  expect(await weightsOnToday(page)).toBe(1)
})

test('clicking away keeps the edit rather than dropping it', async ({ page }) => {
  await open(page, '/settings')
  await expect(page.getByText(/Last recorded/)).toBeVisible()

  await current(page).fill('71.5')
  // Blur is the natural "I am done", so it commits too — an edit must never be
  // silently lost by tapping elsewhere.
  await current(page).blur()
  await expect(current(page)).toHaveValue('71.5')
  expect(await weightsOnToday(page)).toBe(1)
})

test('Escape puts back what was there', async ({ page }) => {
  await open(page, '/settings')
  await expect(page.getByText(/Last recorded/)).toBeVisible()
  const before = await current(page).inputValue()

  await current(page).fill('60')
  await current(page).press('Escape')

  await expect(current(page)).toHaveValue(before)
  expect(await weightsOnToday(page)).toBe(0)
})

test('the Save button does not shove the row about when it appears', async ({ page }) => {
  await open(page, '/settings')
  await expect(page.getByText(/Last recorded/)).toBeVisible()

  const box = () => page.getByRole('button', { name: 'More Current' }).boundingBox()
  const before = await box()
  await current(page).fill('73')
  const after = await box()

  // A control that moves when you use it is the one thing this app has already
  // been told off for twice.
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 0)
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0)
})
