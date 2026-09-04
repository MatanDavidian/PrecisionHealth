import { expect, test, type Page } from '@playwright/test'
import { open } from './app'
import { CHAT_MODEL_COUNT, stubOpenAi, TEXT_ONLY_MODELS, VISION_MODELS } from './openai'

/**
 * Bringing your own OpenAI key, and choosing what reads your photos.
 *
 * The last of E2. This is the path for someone who has spent their free
 * analyses, so every failure here is met by a person who has already decided
 * they want to keep using the app — which is the worst possible audience for
 * an error that says only "something went wrong".
 */

const openAiTab = async (page: Page) => {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'Photo analysis' }).click()
}

const key = (page: Page) => page.getByLabel('Key', { exact: true })

test('with no key, the screen explains how to get one', async ({ page }) => {
  await stubOpenAi(page)
  await openAiTab(page)

  await expect(page.getByText('Don’t have a key yet?')).toBeVisible()
  // The misunderstanding almost everyone arrives with, said out loud.
  await expect(page.getByText('A ChatGPT subscription does not include this.')).toBeVisible()
  await expect(page.getByText(/Add a key above to load the models/)).toBeVisible()

  // Nothing to test until something is typed.
  await expect(page.getByRole('button', { name: 'Test key' })).toBeDisabled()
})

test('a key that works says so, and one that does not says whose fault it is', async ({ page }) => {
  await stubOpenAi(page, 'ok')
  await openAiTab(page)

  await key(page).fill('sk-test-a-working-key')
  await page.getByRole('button', { name: 'Test key' }).click()
  await expect(page.getByText('Key works.')).toBeVisible({ timeout: 15_000 })

  await stubOpenAi(page, 'rejected')
  await key(page).fill('sk-test-a-rejected-key')
  await page.getByRole('button', { name: 'Test key' }).click()
  // Blames the key, because a 401 is about the key.
  await expect(page.getByText(/rejected by the provider/)).toBeVisible({ timeout: 15_000 })
})

test('being offline is not the key’s fault, and does not say it is', async ({ page }) => {
  await stubOpenAi(page, 'offline')
  await openAiTab(page)

  await key(page).fill('sk-test-perfectly-good-key')
  await page.getByRole('button', { name: 'Test key' }).click()

  await expect(page.getByText(/Could not reach the provider/)).toBeVisible({ timeout: 15_000 })
  // Telling someone their key is bad when their wifi is off sends them to
  // regenerate a key that was never the problem.
  await expect(page.getByText(/rejected/)).toBeHidden()
})

test('saving a key loads the account list, without a second click', async ({ page }) => {
  await stubOpenAi(page)
  await openAiTab(page)

  await key(page).fill('sk-test-a-working-key')
  await page.getByRole('button', { name: 'Save key' }).click()

  // No Refresh click in between: waiting for one just looks like the feature
  // is broken.
  const model = page.locator('select#model')
  await expect(model).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(new RegExp(`of your ${CHAT_MODEL_COUNT} chat models`)))
    .toBeVisible()
})

test('the list separates what can read a photo from what cannot', async ({ page }) => {
  await stubOpenAi(page)
  await openAiTab(page)
  await key(page).fill('sk-test-a-working-key')
  await page.getByRole('button', { name: 'Save key' }).click()

  const model = page.locator('select#model')
  await expect(model).toBeVisible({ timeout: 15_000 })

  for (const id of VISION_MODELS) {
    await expect(model.locator(`optgroup[label="Can read photos"] option[value="${id}"]`))
      .toHaveCount(1)
  }
  // Shown but unselectable: seeing why a model is missing beats wondering
  // where it went.
  for (const id of TEXT_ONLY_MODELS) {
    const option = model.locator(`optgroup[label^="Text only"] option[value="${id}"]`)
    await expect(option).toHaveCount(1)
    await expect(option).toBeDisabled()
  }
  // Embeddings, audio and image models are not chat models and never appear.
  for (const id of ['text-embedding-3-large', 'whisper-1', 'dall-e-3']) {
    await expect(model.locator(`option[value="${id}"]`)).toHaveCount(0)
  }

  await model.selectOption('gpt-4o')
  await openAiTab(page)
  await expect(page.locator('select#model')).toHaveValue('gpt-4o', { timeout: 15_000 })
})

test('a saved key loads the list again next time, without being asked twice', async ({ page }) => {
  /*
    This is the test that found the bug it now guards.

    `loadModels` was declared below `if (!settings) return`, so the mount
    effect closed over a binding the first render had never reached — a
    temporal dead zone throw, into a floating promise, with nothing on screen
    to show for it. The list simply never loaded, and someone who had saved a
    key months ago was still being told to save their key.
  */
  await stubOpenAi(page)
  await openAiTab(page)
  await key(page).fill('sk-test-a-working-key')
  await page.getByRole('button', { name: 'Save key' }).click()
  await expect(page.locator('select#model')).toBeVisible({ timeout: 15_000 })

  await openAiTab(page)
  await expect(key(page)).toHaveValue('sk-test-a-working-key')
  await expect(page.locator('select#model')).toBeVisible({ timeout: 15_000 })
  // The instruction that was being shown to people who had already done it.
  await expect(page.getByText(/Save your key and hit Refresh list/)).toBeHidden()
})

test('a model the account does not list can still be typed by hand', async ({ page }) => {
  await stubOpenAi(page)
  await openAiTab(page)
  await key(page).fill('sk-test-a-working-key')
  await page.getByRole('button', { name: 'Save key' }).click()

  const model = page.locator('select#model')
  await expect(model).toBeVisible({ timeout: 15_000 })
  await model.selectOption('__custom__')

  const typed = page.locator('input#model')
  await expect(typed).toBeVisible()
  await typed.fill('gpt-5.6-something-brand-new')
  await typed.blur()

  await openAiTab(page)
  const listed = page.locator('select#model')
  await expect(listed).toBeVisible({ timeout: 15_000 })
  /*
    Kept, and named as not being on the list rather than silently dropped.

    Read as text rather than asserted visible: it is an `<option>` in a closed
    `<select>`, which is present and selected but never "visible" to a browser.
  */
  await expect(listed).toHaveValue('')
  await expect(listed.locator('option[value=""]'))
    .toHaveText('gpt-5.6-something-brand-new (not in your account list)')
})

test('a list that cannot be loaded says why, and keeps the key', async ({ page }) => {
  await stubOpenAi(page, 'ok')
  await openAiTab(page)
  await key(page).fill('sk-test-a-working-key')
  await page.getByRole('button', { name: 'Save key' }).click()
  await expect(page.locator('select#model')).toBeVisible({ timeout: 15_000 })

  await stubOpenAi(page, 'server-error')
  await page.getByRole('button', { name: 'Refresh list' }).click()

  await expect(page.getByText(/OpenAI returned 500 when listing models/))
    .toBeVisible({ timeout: 15_000 })
  // The key is still saved: a failed list is not a reason to make someone
  // paste it again.
  await expect(key(page)).toHaveValue('sk-test-a-working-key')
})

test('a reply that is not a model list is not treated as one', async ({ page }) => {
  await stubOpenAi(page, 'nonsense')
  await openAiTab(page)

  await key(page).fill('sk-test-a-working-key')
  await page.getByRole('button', { name: 'Save key' }).click()

  // 200 with the wrong shape. A successful request is not a successful answer.
  await expect(page.getByText(/unexpected model list/)).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('select#model')).toBeHidden()
})
