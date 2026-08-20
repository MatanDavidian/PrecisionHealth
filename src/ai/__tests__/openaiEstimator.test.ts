import { describe, expect, it, vi } from 'vitest'
import { OpenAiEstimator, listChatModels } from '../openaiEstimator'
import { EstimateError } from '../estimator'
import { SAMPLE_REPLY } from '../fakeEstimator'

const reply = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
  })

const options = (fetchImpl: typeof fetch) => ({
  getApiKey: async () => 'sk-test',
  getModel: async () => 'some-new-model',
  fetchImpl,
})

// jsdom-free: the adapter only needs FileReader for the data URL.
const photo = new Blob(['fake-bytes'], { type: 'image/jpeg' })

describe('parameter dialect negotiation', () => {
  it('retries with max_tokens when the model rejects max_completion_tokens', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      if (bodies.length === 1) {
        return new Response(
          JSON.stringify({ error: { message: "Unsupported parameter: 'max_completion_tokens'" } }),
          { status: 400 },
        )
      }
      return reply(SAMPLE_REPLY)
    }) as unknown as typeof fetch

    const result = await new OpenAiEstimator(options(fetchImpl)).estimate(photo, {})

    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toContain('max_completion_tokens')
    expect(bodies[1]).toContain('"max_tokens"')
    expect(result.items).toHaveLength(2)
  })

  it('drops JSON mode when the model does not support response_format', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'response_format is not supported' } }), {
          status: 400,
        })
      }
      return reply(SAMPLE_REPLY)
    }) as unknown as typeof fetch

    await new OpenAiEstimator(options(fetchImpl)).estimate(photo, {})
    expect(bodies[0]).toContain('response_format')
    expect(bodies[1]).not.toContain('response_format')
  })

  it('sends max_completion_tokens first, since that is what current models want', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      return reply(SAMPLE_REPLY)
    }) as unknown as typeof fetch

    await new OpenAiEstimator(options(fetchImpl)).estimate(photo, {})
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toContain('max_completion_tokens')
  })
})

describe('error mapping', () => {
  const failing = (status: number, body = '{}') =>
    (async () => new Response(body, { status })) as unknown as typeof fetch

  it('maps 401 to a key problem', async () => {
    await expect(new OpenAiEstimator(options(failing(401))).estimate(photo, {})).rejects.toMatchObject({
      kind: 'BAD_KEY',
    })
  })

  it('maps 429 to rate limiting', async () => {
    await expect(new OpenAiEstimator(options(failing(429))).estimate(photo, {})).rejects.toMatchObject({
      kind: 'RATE_LIMIT',
    })
  })

  it('reports a blocked request as blocked, not as being offline', async () => {
    const boom = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    // navigator is absent in this environment, i.e. not known to be offline.
    await expect(new OpenAiEstimator(options(boom)).estimate(photo, {})).rejects.toMatchObject({
      kind: 'BLOCKED',
    })
  })

  it('says offline only when the device really is offline', async () => {
    const boom = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    vi.stubGlobal('navigator', { onLine: false })
    try {
      await expect(new OpenAiEstimator(options(boom)).estimate(photo, {})).rejects.toMatchObject({
        kind: 'OFFLINE',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refuses without a key rather than calling the provider', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const estimator = new OpenAiEstimator({
      getApiKey: async () => undefined,
      getModel: async () => 'm',
      fetchImpl,
    })
    await expect(estimator.estimate(photo, {})).rejects.toBeInstanceOf(EstimateError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('repairs one unparseable reply before giving up', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return calls === 1
        ? new Response(JSON.stringify({ choices: [{ message: { content: 'sorry!' } }] }), { status: 200 })
        : reply(SAMPLE_REPLY)
    }) as unknown as typeof fetch

    const result = await new OpenAiEstimator(options(fetchImpl)).estimate(photo, {})
    expect(calls).toBe(2)
    expect(result.items).toHaveLength(2)
  })
})

describe('listing account models', () => {
  it('keeps chat models and drops the ones that cannot see a photo', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: 'gpt-4o-mini' },
            { id: 'gpt-5.6' },
            { id: 'text-embedding-3-small' },
            { id: 'whisper-1' },
            { id: 'dall-e-3' },
            { id: 'o3-mini' },
            { id: 'tts-1' },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch

    const result = await listChatModels('sk-test', fetchImpl)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = result.models.map((m) => m.id)
    expect(ids).toContain('gpt-4o-mini')
    expect(ids).toContain('gpt-5.6')
    expect(ids).toContain('o3-mini')
    expect(ids).not.toContain('text-embedding-3-small')
    expect(ids).not.toContain('whisper-1')
    expect(ids).not.toContain('dall-e-3')
    expect(ids).not.toContain('tts-1')
  })

  it('puts newer-looking models first', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-5.6-sol' }] }), {
        status: 200,
      })) as unknown as typeof fetch
    const result = await listChatModels('sk-test', fetchImpl)
    expect(result.ok && result.models[0].id).toBe('gpt-5.6-sol')
  })

  it('explains a rejected key instead of showing an empty list', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    const result = await listChatModels('bad', fetchImpl)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/rejected/i)
  })

  it('explains a network failure instead of showing an empty list', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const result = await listChatModels('sk-test', fetchImpl)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/reach/i)
  })
})

describe('reasoning-model headroom', () => {
  it('asks for enough completion budget that hidden reasoning cannot starve the reply', async () => {
    const bodies: string[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      return reply(SAMPLE_REPLY)
    }) as unknown as typeof fetch

    await new OpenAiEstimator(options(fetchImpl)).estimate(photo, {})
    const sent = JSON.parse(bodies[0]) as Record<string, number>
    expect(sent.max_completion_tokens).toBeGreaterThanOrEqual(4000)
  })

  it('surfaces an empty reply as unreadable rather than saving nothing silently', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
        status: 200,
      })) as unknown as typeof fetch

    await expect(new OpenAiEstimator(options(fetchImpl)).estimate(photo, {})).rejects.toMatchObject({
      kind: 'UNREADABLE',
    })
  })
})


describe('which models can read a photo', () => {
  it('knows the text-only families from the ones that can see', async () => {
    const { looksVisionCapable } = await import('../openaiEstimator')

    // Text only.
    expect(looksVisionCapable('gpt-3.5-turbo')).toBe(false)
    expect(looksVisionCapable('gpt-3.5-turbo-16k')).toBe(false)
    expect(looksVisionCapable('gpt-3.5-turbo-instruct')).toBe(false)
    expect(looksVisionCapable('gpt-4')).toBe(false)
    expect(looksVisionCapable('gpt-4-0613')).toBe(false)

    // Vision arrived with gpt-4-turbo, and everything after has it.
    expect(looksVisionCapable('gpt-4-turbo')).toBe(true)
    expect(looksVisionCapable('gpt-4-turbo-2024-04-09')).toBe(true)
    expect(looksVisionCapable('gpt-4o')).toBe(true)
    expect(looksVisionCapable('gpt-4o-mini')).toBe(true)
    expect(looksVisionCapable('gpt-4.1')).toBe(true)
    expect(looksVisionCapable('gpt-4.1-nano')).toBe(true)
    expect(looksVisionCapable('gpt-5')).toBe(true)
    expect(looksVisionCapable('gpt-5.4')).toBe(true)
    expect(looksVisionCapable('gpt-5.6-luna')).toBe(true)
    expect(looksVisionCapable('gpt-5.6-terra')).toBe(true)
    expect(looksVisionCapable('gpt-5.6-sol')).toBe(true)
  })

  it('handles the o-series case by case, because it is not consistent', async () => {
    const { looksVisionCapable } = await import('../openaiEstimator')
    // These cannot see...
    expect(looksVisionCapable('o1-mini')).toBe(false)
    expect(looksVisionCapable('o3-mini')).toBe(false)
    expect(looksVisionCapable('o3-mini-2025-01-31')).toBe(false)
    // ...while these can, despite the near-identical names.
    expect(looksVisionCapable('o4-mini')).toBe(true)
    expect(looksVisionCapable('o1')).toBe(true)
    expect(looksVisionCapable('o3')).toBe(true)
  })

  it('keeps video and image generators out of a chat model list', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'sora-2' }, { id: 'sora-2-pro' }, { id: 'gpt-image-1' }, { id: 'gpt-4o' }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch
    const result = await listChatModels('sk-test', fetchImpl)
    if (!result.ok) throw new Error('expected ok')
    expect(result.models.map((m) => m.id)).toEqual(['gpt-4o'])
  })

  it('flags specialised variants without hiding them', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'gpt-5-search-api' }, { id: 'gpt-5-pro' }, { id: 'gpt-4o' }] }),
        { status: 200 },
      )) as unknown as typeof fetch
    const result = await listChatModels('sk-test', fetchImpl)
    if (!result.ok) throw new Error('expected ok')
    const byId = Object.fromEntries(result.models.map((m) => [m.id, m]))
    expect(byId['gpt-5-search-api'].note).toMatch(/search/)
    expect(byId['gpt-5-pro'].note).toMatch(/expensive/)
    expect(byId['gpt-4o'].note).toBeUndefined()
  })
})
