import { describe, expect, it } from 'vitest'
import { DESIGN_RULES } from '../data/audit'
import { areaQuestion, brokenRules, ruleQuestion } from './audit'

describe('brokenRules', () => {
  it('flags the top rule when Jev is fairly sure', () => {
    // Measured on the "fonts" sample: the planted rule tops out at 0.66.
    expect(brokenRules({ 1: 0.42, 4: 0.66, 7: 0.5 })).toEqual([4])
  })
  it('passes a clean screen', () => {
    expect(brokenRules({ 1: 0.48, 7: 0.45 })).toEqual([])
  })
  it('flags every very likely rule, most likely first', () => {
    expect(brokenRules({ 1: 0.86, 3: 0.97, 5: 0.2 })).toEqual([3, 1])
  })
  it('handles no input', () => {
    expect(brokenRules({})).toEqual([])
  })
})

describe('questions', () => {
  it('embed the rule text', () => {
    expect(ruleQuestion(DESIGN_RULES[0])).toContain(DESIGN_RULES[0].rule)
    expect(areaQuestion(DESIGN_RULES[2])).toContain(DESIGN_RULES[2].rule)
    expect(DESIGN_RULES).toHaveLength(8)
  })
})
