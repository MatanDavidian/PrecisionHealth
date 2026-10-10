import { expect, test } from '@playwright/test'
import { dayKey, open } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * The made-up first-run day says it is made up (Q5) — so a stranger, or an
 * app-store reviewer, never takes it for a real person's food log.
 */

test('signed out, the sample day is labelled on Today and Nutrition', async ({ page }) => {
  await open(page, '/today')
  await expect(page.getByRole('note').filter({ hasText: 'Sample day.' })).toBeVisible({ timeout: 15_000 })
  await open(page, '/nutrition')
  await expect(page.getByRole('note').filter({ hasText: 'the sample never goes into an account' })).toBeVisible({ timeout: 15_000 })
})

test('a day with nothing from the sample has no label', async ({ page }) => {
  await open(page, '/nutrition')
  await expect(page.getByRole('note').filter({ hasText: 'Sample day.' })).toBeVisible({ timeout: 15_000 })
  // A year back: further than the test seed's history reaches.
  await open(page, `/nutrition?d=${dayKey(-365)}`)
  await expect(page.getByRole('button', { name: 'Add meal' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('note').filter({ hasText: 'Sample day.' })).toHaveCount(0)
})

test('an account is never seeded, and never labelled', async ({ page }) => {
  await signIn(page)
  await openSignedIn(page, '/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Sample day.')).toHaveCount(0)
})
