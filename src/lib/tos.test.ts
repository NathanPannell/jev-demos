import { describe, expect, it } from 'vitest'
import { SAMPLE_TOS } from '../data/tos'
import { isHeading, severity, splitClauses } from './tos'

describe('splitClauses', () => {
  it('splits paragraphs and marks headings', () => {
    const c = splitClauses(
      '1. Intro\n\nWe do things.\n\nTERMS\nYou agree to stuff.\r\n\r\nLast updated: today',
    )
    expect(c.map((x) => [x.text, x.heading])).toEqual([
      ['1. Intro', true],
      ['We do things.', false],
      ['TERMS', true],
      ['You agree to stuff.', false],
      ['Last updated: today', true],
    ])
  })

  it('handles the sample document', () => {
    const c = splitClauses(SAMPLE_TOS)
    expect(c.filter((x) => !x.heading).length).toBeGreaterThan(35)
    expect(c[0]).toMatchObject({ heading: true, text: 'MUDDLECLOUD TERMS OF SERVICE' })
  })

  it('caps very long documents', () => {
    expect(splitClauses(Array(400).fill('A sentence.').join('\n\n'))).toHaveLength(150)
  })
})

describe('isHeading', () => {
  it('recognises numbered and title lines', () => {
    expect(isHeading('12. Disputes')).toBe(true)
    expect(isHeading('Section 4 Fees')).toBe(true)
    expect(isHeading('Privacy')).toBe(true)
    expect(isHeading('We may share your data.')).toBe(false)
    expect(isHeading('x'.repeat(80))).toBe(false)
  })
})

describe('severity', () => {
  it('buckets probabilities', () => {
    expect(severity(0.9)).toBe('red')
    expect(severity(0.6)).toBe('yellow')
    expect(severity(0.2)).toBe('ok')
  })
})
