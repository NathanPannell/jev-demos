import { describe, expect, it } from 'vitest'
import { LIMITS, parseJevRequest, stateChars, toUpstreamState, ValidationError } from './validate'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const noul = { type: 'noul', instructions: 'Is it spicy?' }

const bad = (body: unknown, match: RegExp) => {
  expect(() => parseJevRequest(body)).toThrow(ValidationError)
  expect(() => parseJevRequest(body)).toThrow(match)
}

describe('parseJevRequest', () => {
  it('accepts each allowed question type', () => {
    const req = parseJevRequest({
      state: 'hello',
      image: PNG,
      questions: {
        a: noul,
        b: { type: 'choice', instructions: 'Pick', criteria: { x: 'X', y: 'Y' } },
        c: { type: 'score', instructions: 'Rate', criteria: ['low', 'high'] },
        d: { type: 'box', instructions: 'Find the cat' },
      },
    })
    expect(Object.keys(req.questions)).toEqual(['a', 'b', 'c', 'd'])
    expect(req.questions.c.criteria).toEqual(['low', 'high'])
  })

  it('accepts object state', () => {
    const req = parseJevRequest({ state: { scene: 'a', command: 'b' }, questions: { a: noul } })
    expect(req.state).toEqual({ scene: 'a', command: 'b' })
  })

  it('rejects non-objects and missing input', () => {
    bad(null, /JSON object/)
    bad({ questions: { a: noul } }, /state or image/)
    bad({ state: 'x', questions: [] }, /questions must be/)
    bad({ state: 'x', questions: {} }, /1 to/)
  })

  it('rejects unknown question types and bad keys', () => {
    bad({ state: 'x', questions: { a: { type: 'chat', instructions: 'hi' } } }, /unsupported type/)
    bad({ state: 'x', questions: { 'a b': noul } }, /not a valid key/)
    bad({ state: 'x', questions: { a: 'nope' } }, /must be an object/)
    bad({ state: 'x', questions: { a: { type: 'noul', instructions: '' } } }, /non-empty/)
    bad({ state: 'x', questions: { a: { ...noul, criteria: ['a', 'b'] } } }, /takes no criteria/)
  })

  it('validates choice and score criteria', () => {
    bad({ state: 'x', questions: { a: { type: 'choice', instructions: 'p' } } }, /needs criteria/)
    bad(
      { state: 'x', questions: { a: { type: 'choice', instructions: 'p', criteria: { x: 'X' } } } },
      /2 to/,
    )
    bad(
      {
        state: 'x',
        questions: { a: { type: 'choice', instructions: 'p', criteria: { x: 'X', y: 3 } } },
      },
      /option y/,
    )
    bad(
      { state: 'x', questions: { a: { type: 'score', instructions: 'r', criteria: 'no' } } },
      /2 to/,
    )
    bad(
      { state: 'x', questions: { a: { type: 'score', instructions: 'r', criteria: ['a', ''] } } },
      /level 1/,
    )
  })

  it('needs an image for box questions', () => {
    bad({ state: 'x', questions: { a: { type: 'box', instructions: 'cat' } } }, /needs an image/)
  })

  it('caps sizes', () => {
    bad({ state: 'x'.repeat(LIMITS.stateChars + 1), questions: { a: noul } }, /longer than/)
    bad(
      { state: 'x', questions: { a: { type: 'noul', instructions: 'x'.repeat(5000) } } },
      /longer than/,
    )
    const tooMany = Object.fromEntries(
      Array.from({ length: LIMITS.questions + 1 }, (_, i) => [`q${i}`, noul]),
    )
    bad({ state: 'x', questions: tooMany }, /1 to/)
    const bigImage = `data:image/jpeg;base64,${'A'.repeat(LIMITS.imageBytes * 2)}`
    bad({ image: bigImage, questions: { a: noul } }, /too large/)
  })

  it('validates state objects', () => {
    bad({ state: 5, questions: { a: noul } }, /string or an object/)
    bad({ state: {}, questions: { a: noul } }, /1 to/)
    bad({ state: { a: 1 }, questions: { a: noul } }, /must be a string/)
    bad({ state: { a: 'x'.repeat(LIMITS.stateChars + 1) }, questions: { a: noul } }, /longer than/)
    bad({ state: { a: 'x' }, image: PNG, questions: { a: noul } }, /must be a string/)
  })

  it('only accepts PNG or JPEG data URLs', () => {
    bad({ image: 'https://example.com/a.png', questions: { a: noul } }, /data URL/)
    bad({ image: 'data:image/gif;base64,R0lGOD', questions: { a: noul } }, /data URL/)
  })
})

describe('toUpstreamState', () => {
  it('passes text state through', () => {
    expect(toUpstreamState({ state: 'hi', questions: {} })).toBe('hi')
  })
  it('wraps images as image_url parts', () => {
    expect(toUpstreamState({ state: 'caption', image: PNG, questions: {} })).toEqual([
      'caption',
      { type: 'image_url', image_url: { url: PNG } },
    ])
    expect(toUpstreamState({ image: PNG, questions: {} })).toEqual([
      { type: 'image_url', image_url: { url: PNG } },
    ])
  })
})

describe('stateChars', () => {
  it('counts string and object state', () => {
    expect(stateChars({ questions: {} })).toBe(0)
    expect(stateChars({ state: 'abc', questions: {} })).toBe(3)
    expect(stateChars({ state: { a: 'ab', b: 'c' }, questions: {} })).toBe(3)
  })
})
