// Unit tests for the proxy's own logic. The upstream fetch is a test double here; the e2e suite and
// the deployed site call the real Jev model.
import { describe, expect, it, vi } from 'vitest'
import {
  createJevHandler,
  defaultLimiter,
  LONG_CONTEXT_CHARS,
  MODEL,
  UPSTREAM_URL,
} from './handler'
import { RateLimiter } from './rateLimit'

const upstreamOk = {
  model: 'typesafe/jev-1.14-20261014',
  answers: { spicy: { type: 'noul', noul: 0.91 } },
  usage: { input_tokens: 285, output_tokens: 20, cost: 0.00001197 },
}

function setup(overrides: Partial<Parameters<typeof createJevHandler>[0]> = {}) {
  let t = 1_000
  const fetchMock = vi.fn(async () => Response.json(upstreamOk))
  const handler = createJevHandler({
    apiKey: 'test-key',
    fetch: fetchMock as unknown as typeof fetch,
    limiter: defaultLimiter(),
    now: () => (t += 50),
    hourlyBudgetUsd: 1,
    ...overrides,
  })
  return { handler, fetchMock }
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/jev', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const ask = { state: 'hot take', questions: { spicy: { type: 'noul', instructions: 'Spicy?' } } }

describe('POST /api/jev', () => {
  it('forwards a valid request with the pinned model and returns answers, cost and latency', async () => {
    const { handler, fetchMock } = setup()
    const res = await handler(post(ask))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      answers: upstreamOk.answers,
      model: upstreamOk.model,
      usage: { inputTokens: 285, outputTokens: 20, cost: 0.00001197 },
      latencyMs: 50,
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(UPSTREAM_URL)
    const sent = JSON.parse(init.body as string)
    expect(sent.model).toBe(MODEL)
    expect(sent.state).toBe('hot take')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key')
  })

  it('sends images as image_url state with the images header', async () => {
    const { handler, fetchMock } = setup()
    const image = 'data:image/jpeg;base64,/9j/4AAQ'
    await handler(post({ image, questions: { where: { type: 'box', instructions: 'cat' } } }))
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(init.body as string).state).toEqual([
      { type: 'image_url', image_url: { url: image } },
    ])
    expect((init.headers as Record<string, string>)['TypeSafe-Danger-Zone-Images']).toBe('true')
  })

  it('opts in to long context for big documents', async () => {
    const { handler, fetchMock } = setup()
    await handler(post({ ...ask, state: 'x'.repeat(LONG_CONTEXT_CHARS + 1) }))
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['TypeSafe-Danger-Zone-Long-Context']).toBe(
      'true',
    )
  })

  it('rejects bad input before calling Jev', async () => {
    const { handler, fetchMock } = setup()
    expect((await handler(post('{not json'))).status).toBe(400)
    const res = await handler(
      post({ state: 'x', questions: { a: { type: 'chat', instructions: 'hi' } } }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/unsupported type/)
    expect((await handler(post(ask, { 'content-length': '99999999' }))).status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed without an API key', async () => {
    const { handler } = setup({ apiKey: undefined })
    expect((await handler(post(ask))).status).toBe(500)
  })

  it('rate limits per IP', async () => {
    const limiter = new RateLimiter({ burst: { max: 1, windowMs: 60_000 } })
    const { handler } = setup({ limiter })
    expect((await handler(post(ask))).status).toBe(200)
    const res = await handler(post(ask))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect((await handler(post(ask, { 'x-forwarded-for': '5.6.7.8' }))).status).toBe(200)
  })

  it('stops at the hourly spend cap', async () => {
    const { handler } = setup({ hourlyBudgetUsd: 0.00001 })
    expect((await handler(post(ask))).status).toBe(200)
    expect((await handler(post(ask))).status).toBe(503)
  })

  it('maps upstream failures', async () => {
    const down = setup({ fetch: (async () => Promise.reject(new Error('down'))) as typeof fetch })
    expect((await down.handler(post(ask))).status).toBe(502)

    const err = setup({
      fetch: (async () =>
        Response.json({ error: { message: 'Bad box' } }, { status: 400 })) as typeof fetch,
    })
    const res = await err.handler(post(ask))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Bad box')

    const busy = setup({
      fetch: (async () => Response.json({}, { status: 429 })) as typeof fetch,
    })
    expect((await busy.handler(post(ask))).status).toBe(429)

    const garbled = setup({ fetch: (async () => new Response('<html>')) as typeof fetch })
    expect((await garbled.handler(post(ask))).status).toBe(502)

    const empty = setup({ fetch: (async () => Response.json({ usage: {} })) as typeof fetch })
    expect((await empty.handler(post(ask))).status).toBe(502)
  })

  it('tolerates missing usage fields', async () => {
    const { handler } = setup({
      fetch: (async () => Response.json({ answers: { a: 1 } })) as typeof fetch,
    })
    const body = await (await handler(post(ask))).json()
    expect(body.usage).toEqual({ inputTokens: 0, outputTokens: 0, cost: 0 })
    expect(body.model).toBe(MODEL)
  })
})
