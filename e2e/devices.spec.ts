import { expect, test, type Page } from '@playwright/test'
import { open } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * Watches, and the tokens that let them write.
 *
 * S4.1. Until this screen existed a Garmin token was minted by running a Node
 * script and pasting SQL into the Supabase console — which is a credential
 * exactly one person can have, and the reason the watch app cannot be
 * published.
 *
 * The behaviour that matters is not "a token appears". It is that the token
 * appears ONCE, that the screen says so before showing it, and that the list
 * afterwards can never produce it again.
 */

const accountTab = (page: Page) => page.getByRole('button', { name: 'Account & data' }).click()

test('a device belongs to an account, and says so when there is none', async ({ page }) => {
  await open(page, '/settings')
  await accountTab(page)

  await expect(page.getByText('Watches and devices')).toBeVisible()
  await expect(page.getByText(/Devices belong to an account/)).toBeVisible()
  // Nothing to create against, so nothing pretends to be creatable.
  await expect(page.getByRole('button', { name: 'Create a token' })).toBeHidden()
})

test('the token is shown once, and the screen says so before showing it', async ({ page }) => {
  await signIn(page)
  await openSignedIn(page, '/settings')
  await accountTab(page)

  await expect(page.getByText(/No devices yet/)).toBeVisible()
  const create = page.getByRole('button', { name: 'Create a token' })
  // A device needs a name, so it can be told apart when revoking.
  await expect(create).toBeDisabled()

  await page.getByLabel('What is it').fill('My FR265')
  await expect(create).toBeEnabled()
  await create.click()

  await expect(page.getByText('Token for My FR265')).toBeVisible({ timeout: 15_000 })
  // The warning is the feature. It has to be readable at the same moment as
  // the token, not after it has been scrolled past.
  await expect(page.getByText(/This is the only time it is shown/)).toBeVisible()
  await expect(page.getByText(/stored hashed/)).toBeVisible()

  // 64 hex characters — a 256-bit value, as minted.
  const shown = await page.locator('code').first().innerText()
  expect(shown).toMatch(/^[0-9a-f]{64}$/)

  // It appears in the list, by name. Scoped to the list because the token
  // panel above names it too.
  await expect(page.getByRole('listitem').filter({ hasText: 'My FR265' })).toBeVisible()
  await expect(page.getByText(/Has not sent anything yet/)).toBeVisible()
})

test('and is gone for good once dismissed', async ({ page }) => {
  await signIn(page)
  await openSignedIn(page, '/settings')
  await accountTab(page)
  await page.getByLabel('What is it').fill('My FR265')
  await page.getByRole('button', { name: 'Create a token' }).click()
  await expect(page.getByText('Token for My FR265')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Token for My FR265')).toBeHidden()
  // The device is still listed; the secret is not. There is no "show again",
  // because the server kept only a hash and could not answer one.
  await expect(page.getByRole('listitem').filter({ hasText: 'My FR265' })).toBeVisible()
  await expect(page.locator('code')).toHaveCount(0)

  // Nor does a reload bring it back.
  await openSignedIn(page, '/settings')
  await accountTab(page)
  await expect(page.getByRole('listitem').filter({ hasText: 'My FR265' })).toBeVisible()
  await expect(page.locator('code')).toHaveCount(0)
})

test('revoking takes a watch off the account', async ({ page }) => {
  await signIn(page, { devices: ['Old watch'] })
  await openSignedIn(page, '/settings')
  await accountTab(page)

  await expect(page.getByText('Old watch')).toBeVisible()
  await page.getByRole('button', { name: 'Revoke' }).click()

  await expect(page.getByText('Old watch')).toBeHidden()
  await expect(page.getByText(/No devices yet/)).toBeVisible()
})

test('too many devices is refused, and says what to do', async ({ page }) => {
  await signIn(page, { minting: 'full' })
  await openSignedIn(page, '/settings')
  await accountTab(page)

  await page.getByLabel('What is it').fill('Yet another watch')
  await page.getByRole('button', { name: 'Create a token' }).click()

  await expect(page.getByText(/8 devices already/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Revoke one you no longer use/)).toBeVisible()
  await expect(page.locator('code')).toHaveCount(0)
})

test('a server that cannot be reached creates nothing, and says so', async ({ page }) => {
  await signIn(page, { minting: 'down' })
  await openSignedIn(page, '/settings')
  await accountTab(page)

  await page.getByLabel('What is it').fill('My FR265')
  await page.getByRole('button', { name: 'Create a token' }).click()

  await expect(page.getByText(/Nothing was created/)).toBeVisible({ timeout: 15_000 })
  // No half-made device in the list to confuse anyone later.
  await expect(page.getByText(/No devices yet/)).toBeVisible()
})
