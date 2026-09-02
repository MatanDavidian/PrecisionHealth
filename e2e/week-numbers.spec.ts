import { expect, test } from '@playwright/test'
import { open } from './app'

/**
 * The week card's three numbers, read off the screen.
 *
 * The domain tests cover the arithmetic; this covers the part that was
 * actually wrong. `balance.eatenKcal` counts only the days that also carry a
 * burn figure, and the card divided it by seven regardless — reporting 1,088
 * kcal a day where the truth was 2,538. Every unit test passed throughout,
 * because none of them looked at what was rendered.
 */

const numbers = (text: string) => (text.match(/[\d,]+/g) ?? []).map((n) => Number(n.replace(/,/g, '')))

test('eaten, burned and the net are all over the same days', async ({ page }) => {
  await open(page, '/today?view=week')

  const card = page.locator('section').filter({ hasText: 'This week' }).first()
  await expect(card).toBeVisible()

  // The headline net, and the two rows beneath it.
  const net = numbers((await card.locator('.font-display').first().textContent()) ?? '')[0]
  const eatenRow = numbers((await card.getByText(/·/).first().textContent()) ?? '')
  const burnedRow = numbers((await card.getByText(/·/).nth(1).textContent()) ?? '')

  const [eatenTotal, eatenPerDay] = eatenRow
  const [burnedTotal, burnedPerDay] = burnedRow

  // One subtraction, on screen.
  expect(Math.abs(eatenTotal - burnedTotal)).toBe(net)

  /*
    The averages must share a denominator. Dividing one by seven and the other
    by the days that reported is what produced a daily figure less than half
    the truth, and it is invisible unless the two are compared.
  */
  const impliedEatenDays = Math.round(eatenTotal / eatenPerDay)
  const impliedBurnedDays = Math.round(burnedTotal / burnedPerDay)
  expect(
    impliedEatenDays,
    `eaten averaged over ${impliedEatenDays} days but burned over ${impliedBurnedDays}`,
  ).toBe(impliedBurnedDays)
})

test('says what the comparison is over when the week is incomplete', async ({ page }) => {
  await open(page, '/today?view=week')
  const card = page.locator('section').filter({ hasText: 'This week' }).first()

  // The fixture week is not fully covered, so the card must say so rather than
  // presenting part of a week as the whole of one.
  await expect(card.getByText(/Compared over the \d+ days with both figures/)).toBeVisible()
})
