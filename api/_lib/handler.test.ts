// Unit tests for the proxy's own logic. The upstream fetch is a test double here; the e2e suite and
// the deployed site call the real Jev model.
import { describe, expect, it, vi } from 'vitest'
import {
  corsHeaders,
  createJevHandler,
  createPreflightHandler,
  DEFAULT_ALLOWED_ORIGINS,
  defaultLimiter,
  estimateCostUsd,
  LONG_CONTEXT_CHARS,
  MODEL,
  parseAllowedOrigins,
  parseBudget,
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

  it('stops at the hourly spend cap, counting in-flight requests', async () => {
    const budget = estimateCostUsd(8, 0) * 1.5
    const { handler } = setup({ hourlyBudgetUsd: budget })
    // The settled cost (upstreamOk) is below the reservation, so allow a few, then refuse.
    let status = 200
    for (let i = 0; i < 50 && status === 200; i++) status = (await handler(post(ask))).status
    expect(status).toBe(503)

    let release: (r: Response) => void = () => {}
    const slow = setup({
      hourlyBudgetUsd: budget,
      fetch: (() => new Promise<Response>((r) => (release = r))) as unknown as typeof fetch,
    })
    const first = slow.handler(post(ask))
    await new Promise((r) => setTimeout(r, 0))
    // The first call is still in flight, but its reservation already counts.
    expect((await slow.handler(post(ask))).status).toBe(503)
    release(Response.json(upstreamOk))
    expect((await first).status).toBe(200)
  })

  it('requires a JSON content type', async () => {
    const { handler, fetchMock } = setup()
    const res = await handler(post(ask, { 'content-type': 'text/plain' }))
    expect(res.status).toBe(415)
    expect(fetchMock).not.toHaveBeenCalled()
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

const allowed = new Set(DEFAULT_ALLOWED_ORIGINS)
const corsNames = (res: Response) =>
  [...res.headers.keys()].filter((name) => name.startsWith('access-control-') || name === 'vary')

const preflight = (headers: Record<string, string>) =>
  new Request('http://localhost/api/jev', {
    method: 'OPTIONS',
    headers: {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
      ...headers,
    },
  })

describe('CORS', () => {
  it('answers a preflight from an allowed origin', () => {
    const res = createPreflightHandler(allowed)(preflight({ origin: 'https://aibuildnight.ca' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://aibuildnight.ca')
    expect(res.headers.get('vary')).toBe('Origin')
    expect(res.headers.get('access-control-allow-methods')).toBe('POST')
    expect(res.headers.get('access-control-allow-headers')).toBe('content-type')
    expect(Number(res.headers.get('access-control-max-age'))).toBeGreaterThan(0)
  })

  it('sends no CORS headers on a preflight from any other origin', () => {
    const options = createPreflightHandler(allowed)
    for (const origin of [
      'https://evil.example',
      'https://aibuildnight.ca.evil.example',
      'http://aibuildnight.ca',
      'https://other-store.myshopify.com',
      'https://abc123.shopifypreview.com',
      'null',
    ]) {
      expect(corsNames(options(preflight({ origin })))).toEqual([])
    }
    expect(corsNames(options(preflight({})))).toEqual([])
  })

  it('adds CORS headers to POST responses for allowed origins only, errors included', async () => {
    const { handler } = setup({ allowedOrigins: allowed })
    const ok = await handler(post(ask, { origin: 'https://www.aibuildnight.ca' }))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://www.aibuildnight.ca')
    expect(ok.headers.get('vary')).toBe('Origin')

    const bad = await handler(post('{not json', { origin: 'https://reecharge.myshopify.com' }))
    expect(bad.status).toBe(400)
    expect(bad.headers.get('access-control-allow-origin')).toBe('https://reecharge.myshopify.com')

    expect(corsNames(await handler(post(ask, { origin: 'https://evil.example' })))).toEqual([])
    expect(corsNames(await handler(post(ask)))).toEqual([])
  })

  it('lets allowed origins read 429, 503 and 500 errors', async () => {
    const origin = { origin: 'https://aibuildnight.ca' }
    const limiter = new RateLimiter({ burst: { max: 1, windowMs: 60_000 } })
    const limited = setup({ limiter, allowedOrigins: allowed })
    await limited.handler(post(ask, origin))
    const slow = await limited.handler(post(ask, origin))
    expect(slow.status).toBe(429)
    expect(slow.headers.get('access-control-allow-origin')).toBe('https://aibuildnight.ca')

    const broke = setup({ hourlyBudgetUsd: 0.000000001, allowedOrigins: allowed })
    const capped = await broke.handler(post(ask, origin))
    expect(capped.status).toBe(503)
    expect(capped.headers.get('access-control-allow-origin')).toBe('https://aibuildnight.ca')

    const nokey = setup({ apiKey: undefined, allowedOrigins: allowed })
    const res = await nokey.handler(post(ask, origin))
    expect(res.status).toBe(500)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://aibuildnight.ca')
  })

  it('still requires JSON from an allowed origin', async () => {
    const { handler, fetchMock } = setup({ allowedOrigins: allowed })
    const res = await handler(
      post(ask, { origin: 'https://aibuildnight.ca', 'content-type': 'text/plain' }),
    )
    expect(res.status).toBe(415)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows no origins unless configured', async () => {
    const { handler } = setup()
    expect(corsNames(await handler(post(ask, { origin: 'https://aibuildnight.ca' })))).toEqual([])
  })

  it('never puts the API key in a response', async () => {
    const { handler } = setup({ allowedOrigins: allowed })
    const res = await handler(post(ask, { origin: 'https://aibuildnight.ca' }))
    const headers = JSON.stringify([...res.headers.entries()])
    expect(headers + (await res.text())).not.toContain('test-key')
  })

  it('keeps CORS headers on an unexpected error', async () => {
    const limiter = new RateLimiter({ burst: { max: 1, windowMs: 60_000 } })
    limiter.check = () => {
      throw new Error('boom')
    }
    const { handler } = setup({ limiter, allowedOrigins: allowed })
    const res = await handler(post(ask, { origin: 'https://aibuildnight.ca' }))
    expect(res.status).toBe(500)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://aibuildnight.ca')
  })

  it('matches origins exactly', () => {
    expect(corsHeaders('https://aibuildnight.ca/', allowed)).toEqual({})
    expect(corsHeaders('HTTPS://AIBUILDNIGHT.CA', allowed)).toEqual({})
    expect(corsHeaders(null, allowed)).toEqual({})
  })
})

describe('parseAllowedOrigins', () => {
  it('defaults to the AI Build Night storefront origins', () => {
    for (const raw of [undefined, '', '  ']) {
      expect([...parseAllowedOrigins(raw)]).toEqual([
        'https://aibuildnight.ca',
        'https://www.aibuildnight.ca',
        'https://reecharge.myshopify.com',
      ])
    }
  })

  it('takes an override and drops wildcards', () => {
    expect([...parseAllowedOrigins(' https://a.example , https://b.example,,')]).toEqual([
      'https://a.example',
      'https://b.example',
    ])
    expect([...parseAllowedOrigins('*, https://*.shopifypreview.com, https://a.example')]).toEqual([
      'https://a.example',
    ])
  })

  it('drops entries that are not canonical origins, failing closed', () => {
    const raw = 'null, https://a.example/, https://A.example, https://a.example/x, a.example, ok'
    expect([...parseAllowedOrigins(raw)]).toEqual([])
    expect([...parseAllowedOrigins('*')]).toEqual([])
    expect([...parseAllowedOrigins('http://localhost:5173')]).toEqual(['http://localhost:5173'])
  })
})

describe('parseBudget', () => {
  it('falls back on missing or invalid values', () => {
    expect(parseBudget(undefined)).toBe(0.5)
    expect(parseBudget('')).toBe(0.5)
    expect(parseBudget('lots')).toBe(0.5)
    expect(parseBudget('-1')).toBe(0.5)
    expect(parseBudget('2')).toBe(2)
  })
})
