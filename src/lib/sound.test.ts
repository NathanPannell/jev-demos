import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function fakeAudio() {
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
  const osc = {
    type: '',
    frequency: param(),
    connect: vi.fn((g) => g),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const gain = { gain: param(), connect: vi.fn() }
  const ctor = vi.fn(function (this: Record<string, unknown>) {
    this.currentTime = 0
    this.destination = {}
    this.createOscillator = () => osc
    this.createGain = () => gain
  })
  return { ctor, osc }
}

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    data,
  }
}

describe('sound', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('is off by default and silent while off', async () => {
    const audio = fakeAudio()
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('AudioContext', audio.ctor)
    const s = await import('./sound')
    expect(s.soundEnabled()).toBe(false)
    s.blip('pop')
    expect(audio.ctor).not.toHaveBeenCalled()
  })

  it('remembers the choice, notifies listeners and plays', async () => {
    const audio = fakeAudio()
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('AudioContext', audio.ctor)
    const s = await import('./sound')
    const listener = vi.fn()
    const unsubscribe = s.subscribeSound(listener)
    s.setSoundEnabled(true)
    expect(s.soundEnabled()).toBe(true)
    expect(storage.data['jev-demos:sound']).toBe('on')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(audio.osc.start).toHaveBeenCalled()
    s.blip('win')
    expect(audio.osc.start).toHaveBeenCalledTimes(2)
    unsubscribe()
    s.setSoundEnabled(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reads a saved preference and survives blocked storage or audio', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'jev-demos:sound': 'on' }))
    vi.stubGlobal('AudioContext', () => {
      throw new Error('no audio')
    })
    let s = await import('./sound')
    expect(s.soundEnabled()).toBe(true)
    expect(() => s.blip('tick')).not.toThrow()

    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    s = await import('./sound')
    expect(s.soundEnabled()).toBe(false)
    expect(() => s.setSoundEnabled(false)).not.toThrow()
  })
})
