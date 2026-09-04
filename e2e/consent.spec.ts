import { expect, test } from '@playwright/test'
import { open } from './app'
import { acceptPolicies, dismissLanguagePrompt, signIn, stubSupabase, STUB_ACCOUNT } from './supabase'

/**
 * Consent, and the documents it points at.
 *
 * S5.1 and S5.2. What makes consent lawful under GDPR Art. 4(11) and 7 is
 * almost entirely observable from outside: unticked by default, separable from
 * the terms, informed, and recorded. Each of those is a browser test.
 */

test('the policy is readable without an account, because that is the point', async ({ page }) => {
  await open(page, '/privacy')

  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
  // The claim people actually care about, on the page rather than in a comment.
  await expect(page.getByText(/sent for analysis once and then discarded/)).toBeVisible()
  // Naming processors: "we use third parties" is not a disclosure.
  for (const processor of ['Supabase', 'OpenAI', 'Cloudflare']) {
    await expect(page.getByText(processor, { exact: false }).first()).toBeVisible()
  }

  // No modal in the way, signed out or not.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('link', { name: 'Read the terms of use' }).click()
  await expect(page.getByRole('heading', { name: 'Terms of Use' })).toBeVisible()
  await expect(page.getByText(/This is not medical advice/i).first()).toBeVisible()
})

test('a draft says it is a draft', async ({ page }) => {
  await open(page, '/privacy')
  // While anything in it is still undecided. A policy that looks finished when
  // it is not is the one way this page could do real harm.
  await expect(page.getByText('This is a draft.')).toBeVisible()
  await expect(page.getByText(/has not been reviewed by a lawyer/)).toBeVisible()
})

test('signing out, nobody is asked to consent to anything', async ({ page }) => {
  await open(page, '/today')
  // Nothing leaves the browser, so there is no third party and no controller
  // to consent to. Asking anyway would teach people to click past the real one.
  await expect(page.getByText('Before we hold your health data')).toBeHidden()
})

test('a new account cannot get past it, and the boxes start empty', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter a code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()

  const gate = page.locator('[aria-labelledby="consent-title"]')
  await expect(gate).toBeVisible({ timeout: 15_000 })

  // Art. 4(11): a pre-ticked box is not consent, it is a layout.
  const boxes = gate.locator('input[type=checkbox]')
  await expect(boxes).toHaveCount(2)
  for (const box of await boxes.all()) await expect(box).not.toBeChecked()

  const agree = page.getByRole('button', { name: 'Agree and continue' })
  await expect(agree).toBeDisabled()

  // Separable from the terms: one is not the other, and one alone is not enough.
  await boxes.first().check()
  await expect(agree).toBeDisabled()
  await boxes.last().check()
  await expect(agree).toBeEnabled()
})

test('only one thing interrupts you at a time', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter a code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()

  /*
    Both modals used to render together — the upper one hid the lower, so it
    looked fine and left two `aria-modal` dialogs competing for anyone using a
    screen reader.
  */
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByText('Before we hold your health data')).toBeVisible()
  await expect(page.getByText('Which language should this be in?')).toBeHidden()

  await acceptPolicies(page)
  // And now the one that was waiting behind it.
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByText('Which language should this be in?')).toBeVisible()
})

test('agreeing is recorded, so it is not asked again', async ({ page }) => {
  await signIn(page)
  await expect(page.getByText('Before we hold your health data')).toBeHidden()

  // A reload is the test: the answer has to be in the store, not in memory.
  await page.goto('/today')
  await dismissLanguagePrompt(page)
  await expect(page.getByText('Before we hold your health data')).toBeHidden()
})

test('you can read what you are agreeing to, from inside the gate', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(STUB_ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter a code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeVisible({
    timeout: 15_000,
  })

  /*
    The links open in a new tab, and the gate must not follow them there.

    It renders app-wide, so without an exception for the policy routes the
    modal would cover the very text it is asking you to agree to — informed
    consent made structurally impossible.
  */
  const opened = page.context().waitForEvent('page')
  await page.getByRole('link', { name: 'Read the Privacy Policy' }).click()
  const tab = await opened
  await tab.waitForLoadState('networkidle')

  await expect(tab.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
  await expect(tab.getByText('Before we hold your health data')).toBeHidden()
})
