import { describe, expect, it } from 'vitest'
import { zoomFor } from './zoom'

describe('zoomFor', () => {
  it('does nothing without a box', () => {
    expect(zoomFor(null)).toEqual({ scale: 1, x: 0, y: 0 })
  })
  it('centres a small box and caps the zoom', () => {
    const z = zoomFor({ left: 0.45, right: 0.55, top: 0.45, bottom: 0.55 })
    expect(z.scale).toBe(4)
    expect(z.x).toBeCloseTo(0.5 - 0.5 * 4)
  })
  it('never pans past the image edge', () => {
    const z = zoomFor({ left: 0, right: 0.2, top: 0, bottom: 0.2 })
    expect(z.scale).toBeCloseTo(3)
    expect(z.x).toBe(0)
    expect(z.y).toBe(0)
    const far = zoomFor({ left: 0.8, right: 1, top: 0.8, bottom: 1 })
    expect(far.x).toBeCloseTo(1 - far.scale)
  })
  it('does not zoom out for big boxes', () => {
    expect(zoomFor({ left: 0, right: 1, top: 0, bottom: 1 }).scale).toBe(1)
  })
})
