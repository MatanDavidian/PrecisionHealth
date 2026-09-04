import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { open } from './app'
import { openSignedIn, signIn } from './supabase'

/**
 * Taking your data with you, and leaving.
 *
 * S5.3 and S5.4. Two rights that only exist if they work in a browser, which
 * is also the only place the interesting parts happen: the file is built and
 * downloaded client-side, and the two deletes are different operations behind
 * similar-looking buttons.
 */

const accountTab = async (page: Page) => {
  await page.getByRole('button', { name: 'Account & data' }).click()
}

/** Clicks Download and reads back what actually landed on disk. */
async function downloadExport(page: Page) {
  const waiting = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download my data' }).click()
  const download = await waiting
  const path = await download.path()
  return {
    filename: download.suggestedFilename(),
    body: JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>,
  }
}

test('the export is the whole store, and the key is not in it', async ({ page }) => {
  await open(page, '/settings')
  await accountTab(page)

  // A key is set first, so its absence from the file means something.
  await page.getByRole('button', { name: 'Photo analysis' }).click()
  await page.getByLabel('Key', { exact: true }).fill('sk-a-real-looking-secret')
  await page.getByRole('button', { name: 'Save key' }).click()
  await expect(page.getByText('Saved')).toBeVisible()
  await accountTab(page)

  const { filename, body } = await downloadExport(page)

  expect(filename).toMatch(/^timeline-export-\d{4}-\d{2}-\d{2}\.json$/)
  expect(body.format).toBe('timeline-personal-export')

  // The sample day is in the store, so the file has to have it.
  const meals = body.meals as { items: { name: string }[] }[]
  expect(meals.length).toBeGreaterThan(0)
  expect(meals.flatMap((m) => m.items.map((i) => i.name))).toContain('Grilled chicken breast')

  // The whole point. A credential in a file people email to themselves is a
  // leak with a bill attached.
  expect(JSON.stringify(body)).not.toContain('sk-a-real-looking-secret')
  expect((body.settings as { apiKeySet: boolean }).apiKeySet).toBe(true)

  // And it says what it is, for whoever opens it a year from now.
  expect((body.notes as string[]).join(' ')).toMatch(/API key/i)
  expect(body.counts).toMatchObject({ meals: meals.length })
})

test('erasing this browser clears it, and the sample day stays gone', async ({ page }) => {
  await open(page, '/nutrition')
  await expect(page.getByText('Grilled chicken breast').first()).toBeVisible()

  await open(page, '/settings')
  await accountTab(page)
  await page.getByRole('button', { name: 'Erase everything here' }).click()

  // Signed out there is no confirmation to type: this is undone by signing in,
  // and friction on both would train people to type past the one that matters.
  await expect(page.getByLabel(/Type DELETE/)).toBeHidden()
  await page.getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByText('This browser has been cleared.')).toBeVisible()

  await open(page, '/nutrition')
  await expect(page.getByText('Grilled chicken breast')).toBeHidden()

  /*
    And still gone after a reload.

    The seeding flag lives in `meta`, which the erase deliberately leaves
    alone — clearing it would make the very last act of a deletion be writing
    the sample day back in.
  */
  await open(page, '/nutrition')
  await expect(page.getByText('Grilled chicken breast')).toBeHidden()
})

test('deleting an account will not proceed until the word is typed', async ({ page }) => {
  await signIn(page)
  await openSignedIn(page, '/settings')
  await accountTab(page)

  await page.getByRole('button', { name: 'Delete my account' }).last().click()
  const confirm = page.getByRole('button', { name: 'Yes, delete it' })
  await expect(confirm).toBeDisabled()

  const box = page.getByLabel(/Type DELETE/)
  await box.fill('delete')
  // Lower case is not the word. Anything that nearly matches would make the
  // typing a formality rather than a check.
  await expect(confirm).toBeDisabled()

  await box.fill('DELETE')
  await expect(confirm).toBeEnabled()

  // And there is always a way out.
  await page.getByRole('button', { name: 'Keep my data' }).click()
  await expect(box).toBeHidden()
})

test('a deleted account says so and signs you out', async ({ page }) => {
  await signIn(page, { deletion: 'ok' })
  await openSignedIn(page, '/settings')
  await accountTab(page)

  await page.getByRole('button', { name: 'Delete my account' }).last().click()
  await page.getByLabel(/Type DELETE/).fill('DELETE')
  await page.getByRole('button', { name: 'Yes, delete it' }).click()

  await expect(page.getByText('Your account and everything in it have been deleted.'))
    .toBeVisible({ timeout: 15_000 })
  // Signed out, because the session is now a token for an account that is gone.
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 })
})

test('a delete that fails says nothing was deleted', async ({ page }) => {
  await signIn(page, { deletion: 'down' })
  await openSignedIn(page, '/settings')
  await accountTab(page)

  await page.getByRole('button', { name: 'Delete my account' }).last().click()
  await page.getByLabel(/Type DELETE/).fill('DELETE')
  await page.getByRole('button', { name: 'Yes, delete it' }).click()

  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible({ timeout: 15_000 })
  // Still signed in, because nothing happened.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('an account that went but left rows behind is not reported as a failure', async ({ page }) => {
  await signIn(page, { deletion: 'stranded' })
  await openSignedIn(page, '/settings')
  await accountTab(page)

  await page.getByRole('button', { name: 'Delete my account' }).last().click()
  await page.getByLabel(/Type DELETE/).fill('DELETE')
  await page.getByRole('button', { name: 'Yes, delete it' }).click()

  // "Try again" would be the wrong advice: the account is already gone.
  await expect(page.getByText(/Your account was deleted, but some records did not go with it/))
    .toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/do not try again/i)).toBeVisible()
})
