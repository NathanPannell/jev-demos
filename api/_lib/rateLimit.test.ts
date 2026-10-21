import { describe, expect, it } from 'vitest'
import { clientIp, RateLimiter } from './rateLimit'

describe('RateLimiter', () => {
  it('allows up to the limit then asks the client to wait', () => {
    const rl = new RateLimiter({ burst: { max: 2, windowMs: 10_000 } })
    expect(rl.check('1.1.1.1', ['burst'], 0)).toBe(0)
    expect(rl.check('1.1.1.1', ['burst'], 1_000)).toBe(0)
    expect(rl.check('1.1.1.1', ['burst'], 2_000)).toBe(8)
    // Another IP is unaffected.
    expect(rl.check('2.2.2.2', ['burst'], 2_000)).toBe(0)
    // The window slides.
    expect(rl.check('1.1.1.1', ['burst'], 10_001)).toBe(0)
  })

  it('does not record refused requests and checks every bucket', () => {
    const rl = new RateLimiter({
      a: { max: 5, windowMs: 1_000 },
      b: { max: 1, windowMs: 1_000 },
    })
    expect(rl.check('ip', ['a', 'b'], 0)).toBe(0)
    expect(rl.check('ip', ['a', 'b'], 10)).toBe(1)
    // Bucket a still has room because the refused hit was not recorded.
    for (let i = 0; i < 4; i++) expect(rl.check('ip', ['a'], 20)).toBe(0)
    expect(rl.check('ip', ['a'], 20)).toBe(1)
  })

  it('ignores unknown buckets and prunes old keys', () => {
    const rl = new RateLimiter({ a: { max: 1, windowMs: 1_000 } }, 2)
    expect(rl.check('ip', ['nope'], 0)).toBe(0)
    rl.check('x', ['a'], 0)
    rl.check('y', ['a'], 0)
    rl.check('z', ['a'], 0)
    // "x" was pruned, so it is allowed again.
    expect(rl.check('x', ['a'], 0)).toBe(0)
  })
})

describe('clientIp', () => {
  it('prefers the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9')
    expect(clientIp(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})
