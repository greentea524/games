let ctx: AudioContext | null = null
let master: GainNode | null = null

let muted = localStorage.getItem('windup_muted') === '1'

export function ensureCtx(): AudioContext | null {
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

export function isMuted(): boolean { return muted }
export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem('windup_muted', m ? '1' : '0')
  if (master) master.gain.value = m ? 0 : 1
}

function tone(type: OscillatorType, fStart: number, fEnd: number, dur: number, vol = 0.08, delay = 0) {
  const c = ensureCtx()
  if (!c || !master) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.connect(g)
  g.connect(master)
  const t0 = c.currentTime + delay
  osc.frequency.setValueAtTime(fStart, t0)
  if (fStart !== fEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, fEnd), t0 + dur)
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(dur: number, vol = 0.08, freq = 1000, delay = 0) {
  const c = ensureCtx()
  if (!c || !master) return
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  const g = c.createGain()
  const t0 = c.currentTime + delay
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(master)
  src.start(t0)
}

export const sfx = {
  jump: () => tone('square', 200, 400, 0.1, 0.05),
  wind: () => tone('sawtooth', 600, 800, 0.1, 0.03),
  hit: () => noise(0.2, 0.1, 500),
  pickup: () => tone('sine', 600, 1200, 0.15, 0.05),
  win: () => {
    tone('square', 400, 400, 0.2, 0.05)
    tone('square', 600, 600, 0.4, 0.05, 0.2)
  },
  menuSelect: () => tone('square', 400, 600, 0.1, 0.05)
}

type MNote = { f: number; d: number }
// Clockwork-style track
const LEAD: MNote[] = [
  { f: 523.25, d: 0.25 }, { f: 659.25, d: 0.25 }, { f: 783.99, d: 0.25 }, { f: 0, d: 0.25 },
  { f: 523.25, d: 0.25 }, { f: 659.25, d: 0.25 }, { f: 783.99, d: 0.5 },
]
const BASS: MNote[] = [
  { f: 130.81, d: 0.25 }, { f: 0, d: 0.25 }, { f: 196.00, d: 0.25 }, { f: 0, d: 0.25 },
  { f: 130.81, d: 0.25 }, { f: 0, d: 0.25 }, { f: 196.00, d: 0.5 }
]

const TRACKS: Record<string, { lead: OscillatorType; bass: OscillatorType; tempo: number; l: MNote[]; b: MNote[] }> = {
  game: { lead: 'square', bass: 'triangle', tempo: 0.8, l: LEAD, b: BASS }
}

let musicBus: GainNode | null = null
let musicTimer: number | null = null
let currentTrack: string | null = null

function bus(): GainNode | null {
  const c = ensureCtx()
  if (!c || !master) return null
  if (!musicBus) {
    musicBus = c.createGain()
    musicBus.gain.value = 0.3
    musicBus.connect(master)
  }
  return musicBus
}

function musicNote(f: number, dur: number, at: number, wave: OscillatorType, vol: number) {
  if (f === 0) return
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
  play(name: 'game') {
    if (currentTrack === name) return
    this.stop()
    const c = ensureCtx()
    const cfg = TRACKS[name]
    if (!c || !cfg) return
    currentTrack = name
    let leadStep = 0, bassStep = 0
    let leadT = c.currentTime + 0.1
    let bassT = c.currentTime + 0.1
    const tick = () => {
      if (currentTrack !== name) return
      const horizon = c.currentTime + 0.25
      while (leadT < horizon) {
        const n = cfg.l[leadStep % cfg.l.length]
        musicNote(n.f, n.d * cfg.tempo, leadT, cfg.lead, 0.05)
        leadT += n.d * cfg.tempo
        leadStep++
      }
      while (bassT < horizon) {
        const n = cfg.b[bassStep % cfg.b.length]
        musicNote(n.f, n.d * cfg.tempo, bassT, cfg.bass, 0.05)
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
  get current() { return currentTrack }
}
