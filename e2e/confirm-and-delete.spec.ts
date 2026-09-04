import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * Confirming an estimate, and deleting a meal.
 *
 * Both are one-click acts with consequences — one settles a number the model
 * guessed, the other removes a record — and neither had any browser coverage.
 */

test('confirming an estimate settles it, and it stops asking', async ({ page }) => {
  await open(page, '/nutrition')

  const confirm = page.getByRole('button', { name: 'Confirm' }).first()
  await expect(confirm, 'the fixture should carry an unconfirmed estimate').toBeVisible()

  // The badge says the number is the model's until someone agrees with it.
  await expect(page.getByText(/AI estimate/i).first()).toBeVisible()

  await confirm.click()

  // Once confirmed there is nothing left to confirm on that item.
  await expect(confirm).toHaveCount(0, { timeout: 10_000 })
})

test('deleting a meal offers an undo that actually restores it', async ({ page }) => {
  await open(page, '/nutrition')

  const rows = page.locator('button[aria-label^="Delete "]')
  const before = await rows.count()
  expect(before, 'the fixture should have meals to delete').toBeGreaterThan(0)

  await rows.first().click()

  /*
    The undo has to say what it cost, because a delete you cannot take back is
    a trap on a phone where the button sits a thumb's width from Edit (Q7).
  */
  const undo = page.getByRole('button', { name: /Undo/i })
  await expect(undo).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/came off the day/i)).toBeVisible()
  await expect(rows).toHaveCount(before - 1)

  await undo.click()
  await expect(rows).toHaveCount(before, { timeout: 10_000 })
})
