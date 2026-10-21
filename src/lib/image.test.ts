import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitDimensions, IMAGE_MAX_PIXELS, toJevImage } from './image'

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

describe('toJevImage', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubBrowser({ ctx = true, decodeFails = false } = {}) {
    const drawn: number[][] = []
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 3136
        naturalHeight = 2000
        decoding = ''
        src = ''
        decode = () => (decodeFails ? Promise.reject(new Error('bad image')) : Promise.resolve())
      },
    )
    const canvas = {
      width: 0,
      height: 0,
      getContext: () =>
        ctx
          ? {
              fillStyle: '',
              fillRect: () => {},
              drawImage: (_i: unknown, ...rest: number[]) => drawn.push(rest),
            }
          : null,
      toDataURL: () => 'data:image/jpeg;base64,AAAA',
    }
    vi.stubGlobal('document', { createElement: () => canvas })
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: revoke })
    return { drawn, revoke, canvas }
  }

  it('re-encodes uploads within limits and releases the object URL', async () => {
    const { drawn, revoke, canvas } = stubBrowser()
    const out = await toJevImage(new Blob(['x']))
    expect(out).toEqual({ dataUrl: 'data:image/jpeg;base64,AAAA', url: out.dataUrl })
    expect([canvas.width, canvas.height]).toEqual([1568, 1000])
    expect(drawn[0]).toEqual([0, 0, 1568, 1000])
    expect(revoke).toHaveBeenCalledWith('blob:1')
  })

  it('keeps the original path for samples', async () => {
    stubBrowser()
    expect((await toJevImage('/samples/a.png')).url).toBe('/samples/a.png')
  })

  it('releases the object URL when decoding fails', async () => {
    const { revoke } = stubBrowser({ decodeFails: true })
    await expect(toJevImage(new Blob(['x']))).rejects.toThrow('bad image')
    expect(revoke).toHaveBeenCalled()
  })

  it('fails clearly without a canvas context', async () => {
    stubBrowser({ ctx: false })
    await expect(toJevImage('/a.png')).rejects.toThrow(/Canvas/)
  })
})
