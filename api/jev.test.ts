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
