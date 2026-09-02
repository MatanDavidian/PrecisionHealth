import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * Recording what came back on the plate.
 *
 * The fixture's lunch has two foods, which is the case that matters: the fake
 * estimator finishes the first and leaves half the second, so a per-food
 * subtraction and a single meal-wide percentage give visibly different answers.
 * A test on a one-food meal could not tell them apart.
 */

test('subtracts each food separately and leaves the numbers needing confirmation', async ({ page }) => {
  await open(page, '/nutrition')

  const totals = page.locator('section').filter({ hasText: /total/i }).locator('.tabular').first()
  await expect(totals).toHaveText('2,130')

  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  await page.getByRole('button', { name: 'Log leftover' }).click()

  await page.getByRole('button', { name: 'Describe', exact: true }).click()
  await page.locator('#leftover-describe').fill('finished the chicken, half the rice came back')
  await page.getByRole('button', { name: 'Estimate leftover' }).click()

  // The headline is weighted by calories, not an average of the fractions.
  await expect(page.getByText(/of this meal was eaten/)).toBeVisible({ timeout: 15_000 })

  // Per food, which is the whole point: one finished, one half left.
  await expect(page.getByText('100%')).toBeVisible()
  await expect(page.getByText('50%')).toBeVisible()

  await page.getByRole('button', { name: 'Apply to this meal' }).click()

  // The day total came down, and the editor closed.
  await expect(page.getByRole('button', { name: 'Log leftover' })).toHaveCount(0)
  await expect(totals).not.toHaveText('2,130')

  // The reduced food is a model's claim, not one the person vouched for, so it
  // asks to be confirmed.
  await expect(page.getByRole('button', { name: 'Confirm' }).first()).toBeVisible()
})

test('says so plainly when nothing came back', async ({ page }) => {
  await open(page, '/nutrition')
  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  await page.getByRole('button', { name: 'Log leftover' }).click()
  await page.getByRole('button', { name: 'Describe', exact: true }).click()
  await page.locator('#leftover-describe').fill('nothing left, the plate is empty')
  await page.getByRole('button', { name: 'Estimate leftover' }).click()

  await expect(page.getByText('Nothing came back — this meal is unchanged.')).toBeVisible({
    timeout: 15_000,
  })
  // Nothing to apply, so no button offering to.
  await expect(page.getByRole('button', { name: 'Apply to this meal' })).toHaveCount(0)
})


/**
 * Each food's grams, keyed by the food's NAME.
 *
 * Not by input id: a superseded item is a new record with a new id, so keying
 * on ids made this test fail on correct behaviour — the numbers were right and
 * only the key had moved.
 */
const gramsInEditor = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const out: Record<string, string> = {}
    document.querySelectorAll<HTMLInputElement>('form input[type=number]').forEach((grams) => {
      if (!grams.id.startsWith('grams-')) return
      const id = grams.id.slice('grams-'.length)
      const name = document.querySelector<HTMLInputElement>(`#name-${CSS.escape(id)}`)
      out[name?.value ?? id] = grams.value
    })
    return out
  })

async function openLeftover(page: import('@playwright/test').Page, said: string) {
  await page.getByRole('button', { name: 'Log leftover' }).click()
  await page.getByRole('button', { name: 'Describe', exact: true }).click()
  await page.locator('#leftover-describe').fill(said)
  await page.getByRole('button', { name: 'Estimate leftover' }).click()
  await expect(page.getByText(/of this meal was eaten/)).toBeVisible({ timeout: 15_000 })
}

test('refuses to run while the editor has unsaved changes', async ({ page }) => {
  await open(page, '/nutrition')
  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()

  const leftover = page.getByRole('button', { name: 'Log leftover' })
  await expect(leftover, 'available on a meal as recorded').toBeEnabled()

  /*
    The bug this guards. A leftover is judged against the SAVED meal, so with
    an edit pending there were two changes on screen computed from different
    numbers — and applying discarded the typed one silently. Grams nudged to
    187 came back 170, with nothing on screen to say so.
  */
  await page.getByRole('button', { name: 'Refill' }).first().click()
  await expect(page.locator('#grams-food-chicken')).toHaveValue('187')

  await expect(leftover, 'a pending edit must block it').toBeDisabled()
  await expect(page.getByText(/Save or undo your changes first/)).toBeVisible()

  // Undoing the edit gives it back.
  await page.getByRole('button', { name: /^Back to 170 g$/ }).click()
  await expect(leftover).toBeEnabled()
})

test('closes an open result if an edit appears beneath it', async ({ page }) => {
  await open(page, '/nutrition')
  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  await openLeftover(page, 'finished the chicken, half the rice came back')

  // A result computed from the saved numbers must not sit beside different ones.
  await page.getByRole('button', { name: 'Refill' }).first().click()
  await expect(page.getByText(/of this meal was eaten/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Apply to this meal' })).toHaveCount(0)
})

test('a second leftover measures against what the first one left', async ({ page }) => {
  await open(page, '/nutrition')

  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  await openLeftover(page, 'finished the chicken, half the rice came back')
  await page.getByRole('button', { name: 'Apply to this meal' }).click()
  await expect(page.getByRole('button', { name: 'Log leftover' })).toHaveCount(0)

  // Rice halved once: 280 -> 140.
  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  expect(await gramsInEditor(page)).toEqual({
    'Grilled chicken breast': '170',
    'Rice and vegetables': '140',
  })

  /*
    The second estimate is judged against the reduced plate, not the original.
    It is what proves the supersede chain is read correctly — a naive lookup
    would show the model 280 g of rice that no longer exists.
  */
  await openLeftover(page, 'half the rice came back again')
  await page.getByRole('button', { name: 'Apply to this meal' }).click()

  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  expect(await gramsInEditor(page)).toEqual({
    'Grilled chicken breast': '170',
    'Rice and vegetables': '70',
  })
})

test('offers a photo as well as words, and asks for one before estimating', async ({ page }) => {
  await open(page, '/nutrition')
  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  await page.getByRole('button', { name: 'Log leftover' }).click()

  // Photo is the default, and there is nothing to estimate from yet.
  await expect(page.getByRole('button', { name: 'Photo', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Estimate leftover' })).toBeDisabled()

  // The same is true of an empty description.
  await page.getByRole('button', { name: 'Describe', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Estimate leftover' })).toBeDisabled()
  await page.locator('#leftover-describe').fill('half of it came back')
  await expect(page.getByRole('button', { name: 'Estimate leftover' })).toBeEnabled()
})

test("the day's total falls by what was left", async ({ page }) => {
  await open(page, '/nutrition')
  const totals = page.locator('section').filter({ hasText: /total/i }).locator('.tabular').first()
  const before = Number((await totals.textContent())!.replace(/,/g, ''))

  await page.getByRole('button', { name: /^Edit Lunch$/ }).click()
  await openLeftover(page, 'finished the chicken, half the rice came back')
  const beforeText = (await totals.textContent())!
  await page.getByRole('button', { name: 'Apply to this meal' }).click()

  /*
    Waited for, not read immediately. The write, the reload and the re-render
    are asynchronous, so reading straight after the click sometimes caught the
    old number — a test that passes six times in seven is worse than one that
    fails, because it teaches everyone to re-run instead of look.
  */
  await expect(totals).not.toHaveText(beforeText)

  // Rice was 430 kcal; half of it came back.
  const after = Number((await totals.textContent())!.replace(/,/g, ''))
  expect(before - after).toBe(215)
})
