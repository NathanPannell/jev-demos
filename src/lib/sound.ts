// Optional UI sounds, synthesised with WebAudio. Off by default.
const KEY = 'jev-demos:sound'

let enabled = readPref()
let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

function readPref(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function soundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // storage blocked; keep the in-memory value
  }
  listeners.forEach((l) => l())
  if (on) blip('pop')
}

export function subscribeSound(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

type Sfx = 'tick' | 'pop' | 'hit' | 'whoosh' | 'error' | 'win'

const SFX: Record<
  Sfx,
  { freq: number; to: number; dur: number; type: OscillatorType; vol: number }
> = {
  tick: { freq: 1400, to: 1200, dur: 0.03, type: 'square', vol: 0.025 },
  pop: { freq: 520, to: 880, dur: 0.08, type: 'sine', vol: 0.12 },
  hit: { freq: 660, to: 1320, dur: 0.14, type: 'triangle', vol: 0.12 },
  whoosh: { freq: 300, to: 900, dur: 0.22, type: 'sawtooth', vol: 0.04 },
  error: { freq: 220, to: 140, dur: 0.18, type: 'square', vol: 0.06 },
  win: { freq: 523, to: 1046, dur: 0.4, type: 'triangle', vol: 0.12 },
}

export function blip(kind: Sfx): void {
  if (!enabled) return
  try {
    ctx ??= new AudioContext()
    const s = SFX[kind]
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = ctx.currentTime
    osc.type = s.type
    osc.frequency.setValueAtTime(s.freq, t)
    osc.frequency.exponentialRampToValueAtTime(s.to, t + s.dur)
    gain.gain.setValueAtTime(s.vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + s.dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + s.dur + 0.02)
  } catch {
    // audio unavailable
  }
}
