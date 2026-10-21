import { expect, it } from 'vitest'
import { GET } from './health'

it('reports ok', async () => {
  const res = GET()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, model: 'typesafe/jev-1.14' })
})
