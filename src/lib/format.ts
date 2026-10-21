/** Formats a USD amount with enough decimals to show sub-cent Jev costs. */
export function formatUsd(amount: number, decimals = 8): string {
  if (!Number.isFinite(amount) || amount < 0) return '$0'
  return `$${amount.toFixed(decimals)}`
}

/** Formats a latency in milliseconds. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '–'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
}

/** Formats a 0..1 probability as a whole percentage. */
export function formatPct(p: number): string {
  if (!Number.isFinite(p)) return '–'
  return `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`
}
