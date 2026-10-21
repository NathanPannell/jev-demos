import { describe, expect, it } from 'vitest'
import { fitDimensions, IMAGE_MAX_PIXELS } from './image'

describe('fitDimensions', () => {
  it('leaves images within limits alone', () => {
    expect(fitDimensions(960, 640)).toEqual({ width: 960, height: 640 })
  })
  it('shrinks big images to the max side and pixel budget', () => {
    expect(fitDimensions(4000, 3000)).toEqual({ width: 1568, height: 1176 })
    const sq = fitDimensions(3000, 3000)
    expect(sq.width * sq.height).toBeLessThanOrEqual(IMAGE_MAX_PIXELS)
  })
  it('grows tiny images to the min side', () => {
    expect(fitDimensions(100, 200)).toEqual({ width: 280, height: 560 })
  })
  it('clamps extreme aspect ratios', () => {
    expect(fitDimensions(10_000, 100)).toEqual({ width: 1568, height: 280 })
  })
  it('rejects empty images', () => {
    expect(() => fitDimensions(0, 10)).toThrow()
  })
})
