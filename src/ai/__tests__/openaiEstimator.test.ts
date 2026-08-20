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

  it('maps a network failure to offline', async () => {
    const boom = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(new OpenAiEstimator(options(boom)).estimate(photo, {})).rejects.toMatchObject({
      kind: 'OFFLINE',
    })
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

    const models = await listChatModels('sk-test', fetchImpl)
    expect(models).toContain('gpt-4o-mini')
    expect(models).toContain('gpt-5.6')
    expect(models).toContain('o3-mini')
    expect(models).not.toContain('text-embedding-3-small')
    expect(models).not.toContain('whisper-1')
    expect(models).not.toContain('dall-e-3')
    expect(models).not.toContain('tts-1')
  })

  it('returns nothing rather than throwing when the key is bad', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    expect(await listChatModels('bad', fetchImpl)).toEqual([])
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
