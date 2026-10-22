import { clientIp, RateLimiter } from './rateLimit.js'
import {
  LIMITS,
  parseJevRequest,
  stateChars,
  toUpstreamState,
  ValidationError,
} from './validate.js'

export const MODEL = 'typesafe/jev-1.14'
export const UPSTREAM_URL = 'https://openrouter.ai/api/v1/systemone'
/** Rough upper bound on a request's cost, reserved against the budget before calling Jev. */
export function estimateCostUsd(chars: number, imageBytes: number): number {
  const tokens = 400 + chars / 3 + (imageBytes > 0 ? 4_000 : 0)
  return tokens * 0.000000042
}

/** Parses the hourly budget env var; anything missing or invalid falls back to the default. */
export function parseBudget(raw: string | undefined, fallback = 0.5): number {
  const n = Number(raw)
  return raw !== undefined && raw.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback
}

/** Sites that may call `/api/jev` from the browser: the AI Build Night Shopify storefront. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://aibuildnight.ca',
  'https://www.aibuildnight.ca',
  'https://reecharge.myshopify.com',
]

/**
 * Parses the comma-separated origin allowlist env var. Entries must be exact, canonical origins
 * (`https://host[:port]`, lowercase, no path); wildcards, `null` and anything else are dropped.
 * Missing or blank falls back to the default.
 */
export function parseAllowedOrigins(
  raw: string | undefined,
  fallback = DEFAULT_ALLOWED_ORIGINS,
): ReadonlySet<string> {
  if (raw === undefined || raw.trim() === '') return new Set(fallback)
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => !o.includes('*') && isCanonicalOrigin(o))
  return new Set(origins)
}

function isCanonicalOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value
  } catch {
    return false
  }
}

/** CORS headers for an allowlisted origin; none for any other (or missing) origin. */
export function corsHeaders(
  origin: string | null,
  allowed: ReadonlySet<string>,
): Record<string, string> {
  if (origin === null || !allowed.has(origin)) return {}
  return { 'access-control-allow-origin': origin, vary: 'Origin' }
}

/** Answers the CORS preflight. Only allowlisted origins get headers, so the browser blocks the rest. */
export function createPreflightHandler(allowed: ReadonlySet<string>) {
  return function OPTIONS(request: Request): Response {
    const cors = corsHeaders(request.headers.get('origin'), allowed)
    if (!cors['access-control-allow-origin']) return new Response(null, { status: 204 })
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '7200',
      },
    })
  }
}

/** Above this much text, opt in to Jev's long-context mode (TypeSafe's "Danger Zone"). */
export const LONG_CONTEXT_CHARS = 100_000

export interface JevAnswerPayload {
  answers: Record<string, unknown>
  model: string
  usage: { inputTokens: number; outputTokens: number; cost: number }
  latencyMs: number
}

export interface HandlerDeps {
  apiKey: string | undefined
  fetch: typeof fetch
  limiter: RateLimiter
  now: () => number
  /** Per-instance spend ceiling per rolling hour, in USD. */
  hourlyBudgetUsd: number
  /** Exact origins that may call from the browser (CORS). Defaults to none. */
  allowedOrigins?: ReadonlySet<string>
}

export function defaultLimiter(): RateLimiter {
  return new RateLimiter({
    // The HN ticker classifies a few comments a second while playing.
    burst: { max: 240, windowMs: 60_000 },
    hour: { max: 4_000, windowMs: 3_600_000 },
    image: { max: 30, windowMs: 60_000 },
    long: { max: 20, windowMs: 60_000 },
  })
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } })

export function createJevHandler(deps: HandlerDeps) {
  const spend: { at: number; cost: number }[] = []

  const spentLastHour = (now: number) => {
    while (spend.length && now - spend[0].at > 3_600_000) spend.shift()
    return spend.reduce((n, s) => n + s.cost, 0)
  }

  // Every response, errors included, carries the CORS headers for an allowed origin, so the
  // calling page can read the error message.
  return async function POST(request: Request): Promise<Response> {
    let res: Response
    try {
      res = await handle(request)
    } catch {
      res = json(500, { error: 'Something went wrong' })
    }
    const cors = corsHeaders(request.headers.get('origin'), deps.allowedOrigins ?? new Set())
    for (const [name, value] of Object.entries(cors)) res.headers.set(name, value)
    return res
  }

  async function handle(request: Request): Promise<Response> {
    if (!deps.apiKey) return json(500, { error: 'Server is missing OPENROUTER_API_KEY' })

    // Requiring JSON forces a CORS preflight, which fails for any origin not on the allowlist, so
    // other sites can't spend the key through their visitors' browsers.
    const type = request.headers.get('content-type') ?? ''
    if (!type.toLowerCase().startsWith('application/json')) {
      return json(415, { error: 'Send application/json' })
    }

    const length = Number(request.headers.get('content-length') ?? '0')
    if (length > LIMITS.bodyBytes) return json(413, { error: 'Request is too large' })

    let raw: string
    try {
      raw = await request.text()
    } catch {
      return json(400, { error: 'Could not read the request body' })
    }
    if (raw.length > LIMITS.bodyBytes) return json(413, { error: 'Request is too large' })

    let req
    try {
      req = parseJevRequest(JSON.parse(raw))
    } catch (err) {
      const message = err instanceof ValidationError ? err.message : 'Body must be valid JSON'
      return json(400, { error: message })
    }

    const now = deps.now()
    const long = stateChars(req) > LONG_CONTEXT_CHARS
    const buckets = ['burst', 'hour']
    if (req.image) buckets.push('image')
    if (long) buckets.push('long')
    const wait = deps.limiter.check(clientIp(request.headers), buckets, now)
    if (wait > 0) {
      return json(
        429,
        { error: `Slow down! Try again in ${wait}s.` },
        { 'retry-after': String(wait) },
      )
    }
    const reserved = {
      at: now,
      cost: estimateCostUsd(stateChars(req), req.image ? req.image.length * 0.75 : 0),
    }
    if (spentLastHour(now) + reserved.cost > deps.hourlyBudgetUsd) {
      return json(503, { error: 'The demo hit its hourly spending cap. Try again later.' })
    }
    // Reserve now so concurrent requests can't all slip under the cap; settle after the call.
    spend.push(reserved)

    const headers: Record<string, string> = {
      authorization: `Bearer ${deps.apiKey}`,
      'content-type': 'application/json',
      'http-referer': 'https://jev-demos-ruddy.vercel.app',
      'x-title': 'Jev Demos',
    }
    if (req.image) headers['TypeSafe-Danger-Zone-Images'] = 'true'
    if (long) headers['TypeSafe-Danger-Zone-Long-Context'] = 'true'

    const started = deps.now()
    let upstream: Response
    try {
      upstream = await deps.fetch(UPSTREAM_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: MODEL,
          state: toUpstreamState(req),
          questions: req.questions,
        }),
        signal: AbortSignal.timeout(25_000),
      })
    } catch {
      reserved.cost = 0
      return json(502, { error: 'Could not reach Jev' })
    }
    const latencyMs = deps.now() - started

    let data: unknown
    try {
      data = await upstream.json()
    } catch {
      return json(502, { error: 'Jev returned an unreadable response' })
    }
    if (!upstream.ok) {
      const message =
        (data as { error?: { message?: string } })?.error?.message ?? `Jev error ${upstream.status}`
      return json(upstream.status === 429 ? 429 : 502, { error: message })
    }

    const d = data as {
      answers?: Record<string, unknown>
      model?: string
      usage?: { input_tokens?: number; output_tokens?: number; cost?: number }
    }
    if (!d.answers) return json(502, { error: 'Jev returned no answers' })
    const cost = d.usage?.cost ?? 0
    reserved.cost = cost

    const payload: JevAnswerPayload = {
      answers: d.answers,
      model: d.model ?? MODEL,
      usage: {
        inputTokens: d.usage?.input_tokens ?? 0,
        outputTokens: d.usage?.output_tokens ?? 0,
        cost,
      },
      latencyMs,
    }
    return json(200, payload)
  }
}
