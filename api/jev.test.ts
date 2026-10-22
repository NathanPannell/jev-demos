import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('is wired to the environment and fails closed without a key', async () => {
  vi.stubEnv('OPENROUTER_API_KEY', '')
  const { POST } = await import('./jev')
  const res = await POST(
    new Request('http://localhost/api/jev', {
      method: 'POST',
      body: JSON.stringify({ state: 'x', questions: { a: { type: 'noul', instructions: 'y' } } }),
    }),
  )
  expect(res.status).toBe(500)
})

const preflight = (origin: string) =>
  new Request('http://localhost/api/jev', {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST' },
  })

it('allows the AI Build Night storefront by default', async () => {
  vi.stubEnv('JEV_ALLOWED_ORIGINS', undefined)
  const { OPTIONS } = await import('./jev')
  for (const origin of [
    'https://aibuildnight.ca',
    'https://www.aibuildnight.ca',
    'https://reecharge.myshopify.com',
  ]) {
    const res = OPTIONS(preflight(origin))
    expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    expect(res.headers.get('access-control-allow-methods')).toBe('POST')
    expect(res.headers.get('access-control-allow-headers')).toBe('content-type')
    expect(res.headers.get('access-control-max-age')).toBe('7200')
  }
  const other = OPTIONS(preflight('https://evil.example'))
  expect(other.headers.get('access-control-allow-origin')).toBeNull()
})

it('reads the origin allowlist from JEV_ALLOWED_ORIGINS', async () => {
  vi.stubEnv('JEV_ALLOWED_ORIGINS', 'https://staging.example')
  vi.stubEnv('OPENROUTER_API_KEY', '')
  const { OPTIONS, POST } = await import('./jev')
  const custom = OPTIONS(preflight('https://staging.example'))
  expect(custom.headers.get('access-control-allow-origin')).toBe('https://staging.example')
  const replaced = OPTIONS(preflight('https://aibuildnight.ca'))
  expect(replaced.headers.get('access-control-allow-origin')).toBeNull()
  const res = await POST(
    new Request('http://localhost/api/jev', {
      method: 'POST',
      headers: { origin: 'https://staging.example', 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  expect(res.headers.get('access-control-allow-origin')).toBe('https://staging.example')
})
