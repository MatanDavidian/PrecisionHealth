import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * Refill, and the mark that says a number moved.
 *
 * The arithmetic is unit-tested in `mealEdits.test.ts`; what cannot be tested
 * there is that pressing the button actually reaches it, that every field on
 * screen follows, and that the grams field takes the accent afterwards. That
 * last one had never once rendered: `fieldClass` already carried
 * `border-hairline`, and the appended `border-accent` lost, because two
 * utilities setting the same property resolve by their order in the generated
 * stylesheet rather than in the class string. Nothing but a computed style can
 * see that.
 */

const ACCENT = 'rgb(194, 103, 62)'

async function openBreakfastEditor(page: import('@playwright/test').Page) {
  await open(page, '/nutrition')
  await page.getByRole('button', { name: /^Edit Breakfast$/ }).click()
  await expect(page.locator('#grams-food-eggs')).toBeVisible()
}

const numbers = async (page: import('@playwright/test').Page) => ({
  grams: await page.locator('#grams-food-eggs').inputValue(),
  kcal: await page.locator('#kcal-food-eggs').inputValue(),
  protein: await page.locator('#protein-food-eggs').inputValue(),
})

test('each press adds ten percent, and every macro follows', async ({ page }) => {
  await openBreakfastEditor(page)
  const refill = page.getByRole('button', { name: 'Refill' })

  expect(await numbers(page)).toEqual({ grams: '320', kcal: '560', protein: '32' })

  await refill.click()
  expect(await numbers(page)).toEqual({ grams: '352', kcal: '616', protein: '35.2' })

  // Compounding: ten percent of what is on screen, not of what was saved.
  await refill.click()
  expect(await numbers(page)).toEqual({ grams: '387', kcal: '677.3', protein: '38.7' })
})

test('the grams field marks itself once the number moved on its own', async ({ page }) => {
  await openBreakfastEditor(page)
  const grams = page.locator('#grams-food-eggs')

  await expect(grams).not.toHaveCSS('border-color', ACCENT)
  await page.getByRole('button', { name: 'Refill' }).click()
  await expect(grams, 'the "this moved" mark never rendered').toHaveCSS('border-color', ACCENT)
})

test('going back restores every number, not just the grams', async ({ page }) => {
  await openBreakfastEditor(page)
  const before = await numbers(page)

  await page.getByRole('button', { name: 'Refill' }).click()
  await page.getByRole('button', { name: 'Refill' }).click()

  await page.getByRole('button', { name: 'Back to 320 g' }).click()
  expect(await numbers(page)).toEqual(before)
})
