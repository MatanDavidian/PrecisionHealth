import type { Page, Route } from '@playwright/test'

/**
 * A Supabase project that only exists inside the browser tab.
 *
 * Three of Phase 1's remaining stories — signing in, signing out, and running
 * out of free analyses — are all on the far side of an account, and the app
 * has no account to test with. The alternatives were both worse than this:
 *
 * - A real test project makes every run depend on a network, a live database
 *   and rows nobody reset, and it cannot produce "the server is down" at all.
 * - A `?signedIn=1` flag would put a test-only branch in the composition root
 *   and, worse, would bypass the very code it is meant to cover:
 *   `readTrialStatus` reads a count out of a PostgREST header, and a fake that
 *   skips the request can never catch that header being read wrong.
 *
 * So the seam is the network. Every request the app makes is real — it builds
 * the URL, sets the headers, parses the reply, and reacts. Only the far end is
 * ours. The build already carries a project URL, so these are matched by path
 * rather than by host, which also means nothing here can reach the real
 * project by accident: an unmatched Supabase call is aborted rather than let
 * through.
 */

const ACCOUNT = { id: '00000000-0000-4000-8000-00000000e2e5', email: 'e2e@example.com' }

const base64url = (value: string) =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * A token shaped like the real thing.
 *
 * Unsigned — there is no server to check it, and there must not be one. But it
 * has to be a genuine three-part JWT with a future `exp`, because the client
 * decodes it and would treat a placeholder string as a corrupt session.
 */
function accessToken(expiresAt: number) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      sub: ACCOUNT.id,
      email: ACCOUNT.email,
      role: 'authenticated',
      aud: 'authenticated',
      iat: Math.floor(Date.now() / 1000),
      exp: expiresAt,
    }),
  )
  return `${header}.${payload}.e2e-not-a-real-signature`
}

function sessionBody() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  return {
    access_token: accessToken(expiresAt),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: 'e2e-refresh-token',
    user: {
      id: ACCOUNT.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: ACCOUNT.email,
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_anonymous: false,
    },
  }
}

export interface StubOptions {
  /** How many trial analyses the ledger reports as spent. */
  trialUsed?: number
  /** How many of those were on the expensive model. */
  solUsed?: number
  /** Refuse to send a sign-in code, the way a real failure would. */
  sendFails?: string
  /** Reject whatever code is typed. */
  codeFails?: string
  /** What the analysis endpoint does when the app asks it to read a photo. */
  analysis?: 'exhausted' | 'down'
}

const json = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', ...headers },
    body: JSON.stringify(body),
  })

/**
 * Installs the stub. Call before navigating.
 *
 * `page.route` patterns are matched in reverse registration order, so the
 * catch-all goes on first and the specific paths override it.
 */
export async function stubSupabase(page: Page, options: StubOptions = {}) {
  const { trialUsed = 0, solUsed = 0 } = options

  /*
    Anything Supabase-shaped that is not handled below is aborted rather than
    fulfilled with an empty success. A silent 200 would let a missing stub look
    like working code; a failed request shows up as a broken screen, which is
    the honest signal that this file needs another route.
  */
  await page.route(/\/(rest|auth|functions|storage)\/v1\//, (route) => route.abort())

  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    /*
      The trial count does not come back in the body. PostgREST answers a
      `head: true` count query with an empty payload and puts the number in
      `content-range`, which is exactly the parsing this is here to exercise.
    */
    if (url.pathname.endsWith('/usage')) {
      const onlySol = url.searchParams.get('model') !== null
      const count = onlySol ? solUsed : trialUsed
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
          'content-range': `*/${count}`,
        },
        body: route.request().method() === 'HEAD' ? '' : '[]',
      })
    }
    // A brand new account holds nothing. That is a claim worth testing: the
    // sample day belongs to the local store and must not follow anyone in.
    return json(route, [])
  })

  await page.route('**/auth/v1/otp**', (route) =>
    options.sendFails
      ? json(route, { error: 'invalid_request', error_description: options.sendFails, msg: options.sendFails }, 400)
      : json(route, {}),
  )

  await page.route('**/auth/v1/verify**', (route) =>
    options.codeFails
      ? json(route, { error: 'invalid_grant', error_description: options.codeFails, msg: options.codeFails }, 403)
      : json(route, sessionBody()),
  )

  await page.route('**/auth/v1/token**', (route) => json(route, sessionBody()))
  await page.route('**/auth/v1/user**', (route) => json(route, sessionBody().user))
  await page.route('**/auth/v1/logout**', (route) =>
    route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' }),
  )

  await page.route('**/functions/v1/**', (route) => {
    if (options.analysis === 'exhausted') {
      return json(route, { error: 'trial_exhausted', used: 10, allowance: 10 }, 402)
    }
    if (options.analysis === 'down') return route.abort('connectionfailed')
    return json(route, { error: 'not_stubbed' }, 500)
  })
}

export const STUB_ACCOUNT = ACCOUNT

/**
 * Signed in, through the real form.
 *
 * Not by seeding storage: this project has already been bitten once by a test
 * that faked a setting directly and went green while the app ignored it. The
 * form is two fields and a click, and it cannot lie about whether signing in
 * works.
 */
export async function signIn(page: Page, options: StubOptions = {}) {
  await stubSupabase(page, options)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel(/Or enter a code/).fill('123456')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  // Asked once per account, and it is a modal: nothing else is clickable
  // until it is answered or waved off.
  await dismissLanguagePrompt(page)
}

/** The first-sign-in language question, waved off without recording a choice. */
export async function dismissLanguagePrompt(page: Page) {
  const later = page.getByRole('button', { name: 'Decide later' })
  await later.click({ timeout: 15_000 })
  await later.waitFor({ state: 'hidden' })
}

/**
 * A screen, signed in.
 *
 * Postponing the language question records nothing on purpose — unanswered is
 * not the same as answered "no" — so it is held in memory and a full page load
 * asks again. Moving around the app never triggers that, because the app is a
 * single page; a test using `goto` does, and has to answer it each time.
 */
export async function openSignedIn(page: Page, path: string) {
  await page.goto(path)
  await dismissLanguagePrompt(page)
}
