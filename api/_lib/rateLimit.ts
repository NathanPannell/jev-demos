// Best-effort, in-memory rate limiting per client IP. Each serverless instance keeps its own
// counters, so this slows abuse rather than guaranteeing a global cap; the OpenRouter key's
// own spend limit is the hard backstop.

export interface Limit {
  /** Maximum requests in the window. */
  max: number
  windowMs: number
}

export class RateLimiter {
  private hits = new Map<string, number[]>()

  constructor(
    private readonly limits: Record<string, Limit>,
    private readonly maxKeys = 10_000,
  ) {}

  /**
   * Records a hit for `ip` in every named bucket and returns the number of seconds to wait
   * if any bucket is over its limit (0 when allowed). A refused request is not recorded.
   */
  check(ip: string, buckets: string[], now = Date.now()): number {
    let retryAfterMs = 0
    const pending: [string, number[]][] = []
    for (const bucket of buckets) {
      const limit = this.limits[bucket]
      if (!limit) continue
      const key = `${bucket}:${ip}`
      const recent = (this.hits.get(key) ?? []).filter((t) => now - t < limit.windowMs)
      if (recent.length >= limit.max) {
        retryAfterMs = Math.max(retryAfterMs, recent[0] + limit.windowMs - now)
      }
      pending.push([key, recent])
    }
    if (retryAfterMs > 0) return Math.ceil(retryAfterMs / 1000)
    for (const [key, recent] of pending) {
      recent.push(now)
      this.hits.set(key, recent)
    }
    this.prune()
    return 0
  }

  private prune(): void {
    if (this.hits.size <= this.maxKeys) return
    // Drop the oldest-inserted keys; Map preserves insertion order.
    const excess = this.hits.size - this.maxKeys
    let i = 0
    for (const key of this.hits.keys()) {
      if (i++ >= excess) break
      this.hits.delete(key)
    }
  }
}

/** The client IP as seen by Vercel's edge (or the local dev server). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}
