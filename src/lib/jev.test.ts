import { describe, expect, it, vi } from 'vitest'
import { askJev, CallMeter, JevError, mapLimit, noul, type JevResult } from './jev'

const result: JevResult = {
  answers: {
    a: { type: 'noul', noul: 0.7 },
    b: { type: 'box', box: { top: 0, bottom: 1, left: 0, right: 1 }, confidence: 1 },
  },
  model: 'typesafe/jev-1.14',
  usage: { inputTokens: 10, outputTokens: 2, cost: 0.000001 },
  latencyMs: 120,
}

describe('askJev', () => {
  it('posts to /api/jev and records the call', async () => {
    const fetchImpl = vi.fn(async () => Response.json(result))
    const m = new CallMeter()
    const listener = vi.fn()
    m.subscribe(listener)
    const r = await askJev(
      'hn',
      { state: 'x', questions: {} },
      { fetchImpl: fetchImpl as unknown as typeof fetch, meterImpl: m },
    )
    expect(r).toEqual(result)
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('/api/jev')
    expect(m.getSnapshot()).toMatchObject({
      calls: 1,
      totalCost: 0.000001,
      last: { tab: 'hn', latencyMs: 120 },
    })
    expect(listener).toHaveBeenCalled()
  })

  it('throws JevError with the server message', async () => {
    const fetchImpl = (async () =>
      Response.json({ error: 'Slow down!' }, { status: 429 })) as typeof fetch
    await expect(askJev('hn', { questions: {} }, { fetchImpl })).rejects.toMatchObject({
      message: 'Slow down!',
      status: 429,
    })
    const broken = (async () => new Response('nope', { status: 502 })) as typeof fetch
    await expect(askJev('hn', { questions: {} }, { fetchImpl: broken })).rejects.toBeInstanceOf(
      JevError,
    )
  })
})

describe('noul', () => {
  it('reads noul answers and defaults others to 0', () => {
    expect(noul(result, 'a')).toBe(0.7)
    expect(noul(result, 'b')).toBe(0)
    expect(noul(result, 'missing')).toBe(0)
  })
})

describe('mapLimit', () => {
  it('keeps order and respects the limit', async () => {
    let active = 0
    let peak = 0
    const out = await mapLimit([5, 1, 3, 2], 2, async (n, i) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, n))
      active--
      return n * 10 + i
    })
    expect(out).toEqual([50, 11, 32, 23])
    expect(peak).toBe(2)
  })
})
