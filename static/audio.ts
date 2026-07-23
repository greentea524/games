// Procedural WebAudio chiptune SFX for Static (#46). No asset files —
// everything is synthesized (GBC sound-chip register). AudioContext is
// created lazily on first use so nothing runs before user interaction.

let ctx: AudioContext | null = null
let master: GainNode | null = null

let muted = localStorage.getItem('static_muted') === '1'

function ensureCtx(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem('static_muted', m ? '1' : '0')
  if (master) master.gain.value = m ? 0 : 1
}

function tone(
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  vol = 0.08,
  delay = 0,
) {
  const c = ensureCtx()
  if (!c || !master) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.connect(gain)
  gain.connect(master)
  const t0 = c.currentTime + delay
  osc.frequency.setValueAtTime(freqStart, t0)
  if (freqStart !== freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration)
  }
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function noise(duration: number, vol = 0.08, freq = 1000, delay = 0) {
  const c = ensureCtx()
  if (!c || !master) return
  const len = Math.max(1, Math.floor(c.sampleRate * duration))
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  const gain = c.createGain()
  const t0 = c.currentTime + delay
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  src.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  src.start(t0)
}

export const sfx = {
  // The centerpiece: TV white-noise burst + a detuning warble as the
  // world flips. Sells the Static-side sonically.
  switchWorld: () => {
    noise(0.35, 0.14, 800)
    noise(0.25, 0.1, 2400, 0.05)
    tone('sawtooth', 440, 110, 0.35, 0.05, 0.02)
    tone('sine', 220, 233, 0.3, 0.04, 0.12) // slight detune wobble
  },
  blip: () => tone('square', 620, 620, 0.04, 0.04),
  menuMove: () => tone('square', 440, 440, 0.05, 0.04),
  menuSelect: () => tone('square', 520, 780, 0.08, 0.05),
  pickup: () => {
    tone('square', 520, 520, 0.09, 0.06)
    tone('square', 780, 780, 0.12, 0.06, 0.09)
  },
  footstep: () => tone('triangle', 140, 90, 0.05, 0.025),
  door: () => noise(0.18, 0.07, 500),
  sting: () => {
    tone('square', 392, 392, 0.12, 0.06)
    tone('square', 494, 494, 0.12, 0.06, 0.12)
    tone('square', 587, 784, 0.22, 0.06, 0.24)
  },
}

// ---- Background music (#21): a small looping chiptune sequencer ----
// The town theme; the Static-side plays the same notes detuned + degraded.
type MNote = { f: number; d: number }
const A = 440, G = 392, E = 329.63, D = 293.66, C = 261.63
const LEAD: MNote[] = [
  { f: A, d: 0.3 }, { f: G, d: 0.3 }, { f: E, d: 0.3 }, { f: G, d: 0.3 },
  { f: D, d: 0.3 }, { f: E, d: 0.3 }, { f: C, d: 0.6 },
  { f: E, d: 0.3 }, { f: G, d: 0.3 }, { f: A, d: 0.3 }, { f: G, d: 0.3 },
  { f: E, d: 0.6 }, { f: D, d: 0.6 },
]
const BASS: MNote[] = [
  { f: 110, d: 0.6 }, { f: 130.81, d: 0.6 },
  { f: 98, d: 0.6 }, { f: 110, d: 0.6 },
]
const TRACKS: Record<string, { detune: number; tempo: number; lead: OscillatorType; bass: OscillatorType }> = {
  town: { detune: 1, tempo: 1, lead: 'triangle', bass: 'square' },
  static: { detune: 0.965, tempo: 1.18, lead: 'sawtooth', bass: 'square' },
}

let musicBus: GainNode | null = null
let musicTimer: number | null = null
let currentTrack: string | null = null

function bus(): GainNode | null {
  const c = ensureCtx()
  if (!c || !master) return null
  if (!musicBus) {
    musicBus = c.createGain()
    musicBus.gain.value = 0.55
    musicBus.connect(master)
  }
  return musicBus
}

function musicNote(f: number, dur: number, at: number, wave: OscillatorType, vol: number) {
  const c = ensureCtx()
  const b = bus()
  if (!c || !b) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = wave
  osc.frequency.value = f
  osc.connect(g)
  g.connect(b)
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(vol, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, at + dur * 0.9)
  osc.start(at)
  osc.stop(at + dur)
}

export const music = {
  play(name: 'town' | 'static') {
    if (currentTrack === name) return
    this.stop()
    const c = ensureCtx()
    const cfg = TRACKS[name]
    if (!c || !cfg) return
    currentTrack = name
    let leadStep = 0, bassStep = 0
    let leadT = c.currentTime + 0.15
    let bassT = c.currentTime + 0.15
    const tick = () => {
      if (currentTrack !== name) return
      const horizon = c.currentTime + 0.25
      while (leadT < horizon) {
        const n = LEAD[leadStep % LEAD.length]
        musicNote(n.f * cfg.detune, n.d * cfg.tempo, leadT, cfg.lead, 0.05)
        leadT += n.d * cfg.tempo
        leadStep++
      }
      while (bassT < horizon) {
        const n = BASS[bassStep % BASS.length]
        musicNote(n.f * cfg.detune, n.d * cfg.tempo, bassT, cfg.bass, 0.035)
        bassT += n.d * cfg.tempo
        bassStep++
      }
    }
    tick()
    musicTimer = window.setInterval(tick, 60)
  },
  stop() {
    currentTrack = null
    if (musicTimer !== null) {
      clearInterval(musicTimer)
      musicTimer = null
    }
  },
  get current() {
    return currentTrack
  },
}
