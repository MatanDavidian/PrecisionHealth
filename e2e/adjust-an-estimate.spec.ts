import { expect, test, type Page } from '@playwright/test'
import { open, storedRows } from './app'

/**
 * Correcting an estimate before it becomes a meal.
 *
 * The fake model reads the fixture photo as 170 g of grilled chicken (281 kcal)
 * and 280 g of rice and vegetables (430 kcal) — 711 kcal. Everything below is
 * arithmetic on those two rows, so a wrong number is a wrong number and not a
 * rounding opinion.
 *
 * What is being protected is the saved record, so that is what is read: the
 * meals and inferences stores, directly. A correct-looking panel that saves the
 * model's numbers anyway is the failure that matters here, and only the store
 * can show it.
 */

const PHOTO = 'e2e/fixtures-meal.jpg'

interface MealRow {
  id: string
  data: {
    items: {
      name: string
      amount: { value: number }
      nutrients: { energy: { value: number }; protein: { value: number } }
      provenance: { source: string }
    }[]
    provenance: { source: string }
  }
}
interface InferenceRow {
  id: string
  data: { output: { corrections?: { index: number; amountG: number; removed?: boolean }[] } }
}

async function estimateThePhoto(page: Page) {
  await open(page, '/log')
  await page.setInputFiles('input[type=file]', PHOTO)
  // The fake model asks one question first; skipping keeps the estimate as read.
  const skip = page.getByRole('button', { name: /Skip/i })
  await expect(skip).toBeVisible({ timeout: 20_000 })
  await skip.click()
  await page.getByRole('button', { name: 'Adjust these numbers' }).click()
  await expect(page.getByText('Your numbers')).toBeVisible()
}

/** The panel's headline figure for one nutrient, e.g. "Calories" → 711. */
const panelTotal = (page: Page, name: 'Calories' | 'Protein' | 'Carbs' | 'Fat') =>
  page.getByText(name, { exact: true }).locator('xpath=following-sibling::p[1]')

const grams = (page: Page, food: string) =>
  page.getByRole('spinbutton', { name: `Grams of ${food}` })

/** Saves, then returns the one meal and one inference the save wrote. */
async function saveAndReadBack(page: Page) {
  const mealsBefore = new Set((await storedRows<MealRow>(page, 'meals')).map((r) => r.id))
  const inferencesBefore = new Set(
    (await storedRows<InferenceRow>(page, 'inferences')).map((r) => r.id),
  )

  const save = page.getByRole('button', { name: 'Save meal' })
  await save.click()
  await expect(save).toHaveCount(0, { timeout: 15_000 })

  /*
    Polled. The screen clears before the write has finished, so a single read
    straight after can find nothing — it did, on the desktop project, while
    the save was fine.
  */
  const added = async () => ({
    meals: (await storedRows<MealRow>(page, 'meals')).filter((r) => !mealsBefore.has(r.id)),
    inferences: (await storedRows<InferenceRow>(page, 'inferences')).filter(
      (r) => !inferencesBefore.has(r.id),
    ),
  })
  await expect
    .poll(async () => {
      const { meals, inferences } = await added()
      return [meals.length, inferences.length]
    }, { timeout: 10_000, message: 'one meal and one audit record saved' })
    .toEqual([1, 1])
  const { meals, inferences } = await added()
  return { meal: meals[0].data, inference: inferences[0].data }
}

test('changing a portion re-scales that row, and only that row', async ({ page }) => {
  await estimateThePhoto(page)
  await expect(panelTotal(page, 'Calories')).toHaveText('711')
  await expect(page.getByText('unchanged')).toBeVisible()

  await grams(page, 'Grilled chicken breast').fill('85')
  await grams(page, 'Grilled chicken breast').press('Enter')

  // Half the chicken: 281 → 141 kcal, 53 → 27 g protein. The rice is untouched.
  await expect(page.getByText('27P · 0C · 3F · 141 kcal')).toBeVisible()
  await expect(page.getByText('11P · 86C · 5F · 430 kcal')).toBeVisible()
  await expect(panelTotal(page, 'Calories')).toHaveText('571')
  await expect(panelTotal(page, 'Protein')).toHaveText('38 g')
  // And it says how far from the model this now is, in both units.
  await expect(page.getByText('−140 kcal vs the estimate')).toBeVisible()
  await expect(page.getByText('−85 g')).toBeVisible()
})

test('what is saved is the corrected meal, and only the edited food counts as confirmed', async ({
  page,
}) => {
  await estimateThePhoto(page)
  await grams(page, 'Grilled chicken breast').fill('85')
  await grams(page, 'Grilled chicken breast').press('Enter')
  await expect(panelTotal(page, 'Calories')).toHaveText('571')

  const { meal, inference } = await saveAndReadBack(page)

  const chicken = meal.items.find((i) => i.name === 'Grilled chicken breast')!
  const rice = meal.items.find((i) => i.name === 'Rice and vegetables')!

  // The person's number, not the model's.
  expect(chicken.amount.value).toBe(85)
  expect(Math.round(chicken.nutrients.energy.value)).toBe(141)
  /*
    A human looked at that number and said what it should be — that is
    confirmation, so it is not left waiting for a Confirm tap. The rice
    nobody touched is still the model's guess, and still needs one.
  */
  expect(chicken.provenance.source).toBe('USER')
  expect(rice.amount.value).toBe(280)
  expect(rice.provenance.source).toBe('AI_ESTIMATE')

  // The meal as a whole remains an estimate: most of it came from a model.
  expect(meal.provenance.source).toBe('AI_ESTIMATE')

  // And the audit keeps both halves: what the model said, what was changed.
  expect(inference.output.corrections).toEqual(
    expect.arrayContaining([expect.objectContaining({ amountG: 85 })]),
  )
})

test('a food marked "not on the plate" is left out of the meal entirely', async ({ page }) => {
  await estimateThePhoto(page)

  await page.getByRole('button', { name: 'Not on the plate' }).nth(1).click()
  await expect(panelTotal(page, 'Calories')).toHaveText('281')
  await expect(page.getByRole('button', { name: 'Put it back' })).toBeVisible()

  const { meal } = await saveAndReadBack(page)
  expect(meal.items.map((i) => i.name)).toEqual(['Grilled chicken breast'])
})

test('"Put it back" and "Back to the estimate" undo, so nothing sticks by accident', async ({
  page,
}) => {
  await estimateThePhoto(page)

  await page.getByRole('button', { name: 'Not on the plate' }).nth(1).click()
  await page.getByRole('button', { name: 'Put it back' }).click()
  await expect(panelTotal(page, 'Calories')).toHaveText('711')

  await grams(page, 'Grilled chicken breast').fill('340')
  await grams(page, 'Grilled chicken breast').press('Enter')
  await expect(panelTotal(page, 'Calories')).toHaveText('992')

  await page.getByRole('button', { name: 'Back to the estimate' }).click()
  await expect(page.getByRole('button', { name: 'Adjust these numbers' })).toBeVisible()

  // Saving now saves the model's reading, untouched — no stale edit rides along.
  const { meal, inference } = await saveAndReadBack(page)
  expect(meal.items.map((i) => i.amount.value).sort((a, b) => a - b)).toEqual([170, 280])
  expect(meal.items.every((i) => i.provenance.source === 'AI_ESTIMATE')).toBe(true)
  expect(inference.output.corrections).toBeUndefined()
})
