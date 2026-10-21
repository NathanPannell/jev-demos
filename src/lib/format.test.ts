import { describe, expect, it } from 'vitest'
import { formatMs, formatPct, formatUsd } from './format'

describe('formatUsd', () => {
  it('shows tiny costs with many decimals', () => {
    expect(formatUsd(0.000012642)).toBe('$0.00001264')
  })
  it('guards against bad input', () => {
    expect(formatUsd(Number.NaN)).toBe('$0')
    expect(formatUsd(-1)).toBe('$0')
  })
})

describe('formatMs', () => {
  it('uses ms below a second and seconds above', () => {
    expect(formatMs(182.4)).toBe('182 ms')
    expect(formatMs(1520)).toBe('1.52 s')
    expect(formatMs(-5)).toBe('–')
  })
})

describe('formatPct', () => {
  it('clamps and rounds', () => {
    expect(formatPct(0.914)).toBe('91%')
    expect(formatPct(1.4)).toBe('100%')
    expect(formatPct(Number.NaN)).toBe('–')
  })
})
