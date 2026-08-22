import { describe, expect, it, vi } from 'vitest'
import { ProxyEstimator, TrialExhaustedError } from '../proxyEstimator'
import { EstimateError } from '../estimator'
import { SAMPLE_REPLY } from '../fakeEstimator'

const photo = new Blob(['bytes'], { type: 'image/jpeg' })

// `null` means signed out. An `undefined` default would be silently replaced
// by the default value, which is exactly the bug this comment now prevents.
const options = (fetchImpl: typeof fetch, token: string | null = 'jwt-token') => ({
  supabaseUrl: 'https://ref.supabase.co',
  anonKey: 'sb_publishable_test',
  getAccessToken: async () => token ?? undefined,
  getDay: () => '2026-08-22',
  getModel: async () => 'gpt-5.6-sol',
  fetchImpl,
})

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('analysis through our own server', () => {
  it('sends the photo, the hints and the local day, with the session token', async () => {
    let captured: { url: string; init?: RequestInit } | undefined
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url, init }
      return reply({ content: JSON.stringify(SAMPLE_REPLY), model: 'gpt-5.6-sol' })
    }) as unknown as typeof fetch

    const result = await new ProxyEstimator(options(fetchImpl)).estimate(photo, {
      foodName: 'salad',
      totalGrams: 300,
    })

    expect(captured!.url).toContain('/functions/v1/estimate-food')
    const sent = JSON.parse(String(captured!.init!.body))
    expect(sent.photo.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(sent.hints).toEqual({ foodName: 'salad', totalGrams: 300 })
    // The DAY travels with the request: a daily cap has to mean the user's
    // day, not the server's (D7).
    expect(sent.day).toBe('2026-08-22')
    // The model is a REQUEST, not a decision — the server clamps it.
    expect(sent.model).toBe('gpt-5.6-sol')
    expect((captured!.init!.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token')

    expect(result.items).toHaveLength(2)
    // The server reports the model; the client never picks it.
    expect(result.model).toBe('gpt-5.6-sol')
  })

  it('applies the grams hint exactly as the direct adapter does', async () => {
    const fetchImpl = (async () =>
      reply({ content: JSON.stringify(SAMPLE_REPLY), model: 'gpt-5.6-sol' })) as unknown as typeof fetch
    const result = await new ProxyEstimator(options(fetchImpl)).estimate(photo, { totalGrams: 900 })
    const total = result.items.reduce((sum, item) => sum + item.amountG, 0)
    expect(total).toBeCloseTo(900, 6)
  })

  it('reports a spent trial as its own state, not as a failure', async () => {
    const fetchImpl = (async () =>
      reply({ error: 'trial_exhausted', used: 10, allowance: 10 }, 402)) as unknown as typeof fetch

    const error = await new ProxyEstimator(options(fetchImpl))
      .estimate(photo, {})
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TrialExhaustedError)
    expect((error as TrialExhaustedError).used).toBe(10)
    expect((error as TrialExhaustedError).allowance).toBe(10)
  })

  it('never calls the server without a session', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(
      new ProxyEstimator(options(fetchImpl, null)).estimate(photo, {}),
    ).rejects.toBeInstanceOf(EstimateError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('asks the user to sign in again when the token has expired', async () => {
    const fetchImpl = (async () => reply({ error: 'not_signed_in' }, 401)) as unknown as typeof fetch
    await expect(new ProxyEstimator(options(fetchImpl)).estimate(photo, {})).rejects.toMatchObject({
      kind: 'NO_KEY',
    })
  })

  it('does not blame the user when the server has no master key', async () => {
    const fetchImpl = (async () =>
      reply({ error: 'master_key_missing' }, 503)) as unknown as typeof fetch
    const error = await new ProxyEstimator(options(fetchImpl)).estimate(photo, {}).catch((e) => e)
    expect((error as EstimateError).kind).toBe('PROVIDER')
    expect((error as Error).message).toMatch(/not configured on the server/i)
  })

  it('reports a blocked request as blocked rather than as being offline', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(new ProxyEstimator(options(fetchImpl)).estimate(photo, {})).rejects.toMatchObject({
      kind: 'BLOCKED',
    })
  })

  it('validates the server reply with the same rules as the direct path', async () => {
    const fetchImpl = (async () =>
      reply({ content: JSON.stringify({ items: [] }), model: 'gpt-5.6-sol' })) as unknown as typeof fetch
    await expect(new ProxyEstimator(options(fetchImpl)).estimate(photo, {})).rejects.toMatchObject({
      kind: 'UNREADABLE',
    })
  })
})

describe('when the owner runs out of budget', () => {
  it('says free analysis is unavailable rather than blaming the user', async () => {
    const fetchImpl = (async () =>
      reply({ error: 'free_analysis_unavailable' }, 503)) as unknown as typeof fetch
    const error = await new ProxyEstimator(options(fetchImpl)).estimate(photo, {}).catch((e) => e)
    expect((error as EstimateError).kind).toBe('QUOTA')
    expect((error as Error).message).toMatch(/own OpenAI key/i)
  })
})

describe('when the best model\'s budget is spent', () => {
  it('reports that a different model actually ran, rather than hiding it', async () => {
    const fetchImpl = (async () =>
      reply({
        content: JSON.stringify(SAMPLE_REPLY),
        model: 'gpt-5.6-terra',
        downgraded: true,
        trial: { used: 5, allowance: 10, solUsed: 4, solAllowance: 4 },
      })) as unknown as typeof fetch

    const estimator = new ProxyEstimator(options(fetchImpl))
    const result = await estimator.estimate(photo, {})

    // Asked for sol, got terra — and the app knows, so it can say so.
    expect(result.model).toBe('gpt-5.6-terra')
    expect(estimator.downgraded).toBe(true)
    expect(estimator.trial?.solUsed).toBe(4)
  })
})
