import type { DesignRule } from '../data/audit'

/** A rule counts as broken if it is Jev's top pick at >= 0.6, or any rule at >= 0.85. */
export const TOP_FLOOR = 0.6
export const ANY_FLOOR = 0.85

export function brokenRules(probabilities: Record<number, number>): number[] {
  const entries = Object.entries(probabilities).map(([id, p]) => [Number(id), p] as const)
  if (entries.length === 0) return []
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const broken = new Set<number>()
  if (sorted[0][1] >= TOP_FLOOR) broken.add(sorted[0][0])
  for (const [id, p] of entries) if (p >= ANY_FLOOR) broken.add(id)
  return [...broken].sort((a, b) => (probabilities[b] ?? 0) - (probabilities[a] ?? 0))
}

export function ruleQuestion(rule: DesignRule): string {
  return `Does this UI screenshot violate this design rule? Rule: ${rule.rule}`
}

export function areaQuestion(rule: DesignRule): string {
  return `The part of this UI screenshot that breaks this design rule: ${rule.rule}`
}
