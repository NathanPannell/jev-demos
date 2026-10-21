// Browser client for /api/jev plus a tiny store of per-call latency and cost for the meter.

export interface NoulAnswer {
  type: 'noul'
  noul: number
}
export interface ChoiceAnswer {
  type: 'choice'
  choice: string
  probabilities: Record<string, number>
  confidence: number
}
export interface ScoreAnswer {
  type: 'score'
  score: number
  legend: Record<string, string>
  probabilities: Record<string, number>
  confidence: number
}
export interface Box {
  top: number
  bottom: number
  left: number
  right: number
}
export interface BoxAnswer {
  type: 'box'
  box: Box
  confidence: number
}
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer | BoxAnswer

export type Question =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'box'; instructions: string }

export interface JevRequest {
  state?: string | Record<string, string>
  image?: string
  questions: Record<string, Question>
}

export interface JevResult {
  answers: Record<string, Answer>
  model: string
  usage: { inputTokens: number; outputTokens: number; cost: number }
  /** Time Jev took, measured by our server around the OpenRouter call. */
  latencyMs: number
}

export interface CallRecord {
  tab: string
  latencyMs: number
  cost: number
  inputTokens: number
  at: number
}

export interface MeterState {
  calls: number
  totalCost: number
  last: CallRecord | null
}

type Listener = () => void

/** Session-wide tally of Jev calls, shown in the footer meter. */
export class CallMeter {
  private state: MeterState = { calls: 0, totalCost: 0, last: null }
  private listeners = new Set<Listener>()

  record(call: CallRecord): void {
    this.state = {
      calls: this.state.calls + 1,
      totalCost: this.state.totalCost + call.cost,
      last: call,
    }
    this.listeners.forEach((l) => l())
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): MeterState => this.state
}

export const meter = new CallMeter()

export class JevError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function askJev(
  tab: string,
  req: JevRequest,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch; meterImpl?: CallMeter } = {},
): Promise<JevResult> {
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch('/api/jev', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal: opts.signal,
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // fall through to the error below
  }
  if (!res.ok || !data) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`
    throw new JevError(message, res.status)
  }
  const result = data as JevResult
  ;(opts.meterImpl ?? meter).record({
    tab,
    latencyMs: result.latencyMs,
    cost: result.usage.cost,
    inputTokens: result.usage.inputTokens,
    at: Date.now(),
  })
  return result
}

export function noul(result: JevResult, key: string): number {
  const a = result.answers[key]
  return a?.type === 'noul' ? a.noul : 0
}

/** Runs `worker` over `items` with at most `limit` in flight, preserving result order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}
