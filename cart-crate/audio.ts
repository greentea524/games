import { migrateKey } from '../shared/storage'

let zzfxV = 0.3
export let zzfxX: AudioContext

export const zzfxInit = () => {
  if (!zzfxX) {
    zzfxX = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  if (zzfxX.state === 'suspended') {
    zzfxX.resume()
  }
}

export const zzfx = (...zzfxParams: any[]) => {
  if (!zzfxX) return
  return zzfxP(zzfxG(...zzfxParams))
}

const zzfxP = (...t: any[]) => {
  let e = zzfxX.createBufferSource(),
    f = zzfxX.createBuffer(t.length, t[0].length, zzfxX.sampleRate)
  t.map((d, i) => f.getChannelData(i).set(d))
  e.buffer = f
  e.connect(zzfxX.destination)
  e.start()
  return e
}

const zzfxG = (
  q = 1,
  k = 0.05,
  c = 220,
  e = 0,
  t = 0,
  m = 0.1,
  r = 0,
  F = 1,
  v = 0,
  z = 0,
  w = 0,
  A = 0,
  // Positional slot in zzfx's signature. Unused, but it cannot be removed
  // without shifting every argument after it.
  _l = 0,
  B = 0,
  x = 0,
  A2 = 0,
  d = 0,
  u = 1,
  c2 = 0,
  b = 0
) => {
  let y = 2 * Math.PI,
    H = (v *= (500 * y) / zzfxX.sampleRate ** 2),
    I = (0 < x ? 1 : -1) * (y / 4),
    J = (c *= (1 + 2 * k * Math.random() - k) * (y / zzfxX.sampleRate)),
    Z = [],
    g = 0,
    E = 0,
    a = 0,
    n = 1,
    J2 = 0,
    K = 0,
    f = 0,
    p = 0,
    h

  e = 99 + zzfxX.sampleRate * e
  m = zzfxX.sampleRate * m
  r = zzfxX.sampleRate * r
  t = zzfxX.sampleRate * t
  d = zzfxX.sampleRate * d

  for (h = e + m + r + t + d; a < h; Z[a++] = f)
    ++K > 100 * c2 &&
      ((K = 0),
      (f =
        g *
        q *
        zzfxV *
        (a < e
          ? a / e
          : a < e + m
          ? 1 - ((a - e) / m) * (1 - F)
          : a < e + m + r
          ? F
          : a < h - d
          ? ((h - a - d) / t) * F
          : 0)),
      (f = f ? (x ? f / 2 + (x > 0 ? -0.5 : 0) * Math.sin(I) : Math.sin(g)) : 0),
      (f = b ? f / 2 + b * p : f)),
      (p = f),
      (g += J += H += v += w *= y / zzfxX.sampleRate ** 3),
      (E += 1 + A * Math.sin((a * B * y) / zzfxX.sampleRate)),
      (n += 1 - u),
      (J2 += (z * y) / zzfxX.sampleRate),
      (g += z ? Math.sin(J2) * n : 0),
      (I += (A2 * y) / zzfxX.sampleRate)

  return [Z]
}

// Predefined sounds
export const playMove = () => zzfx(1.2,0.05,400,0,0,0.02,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
export const playPush = () => zzfx(1.5,0.05,120,0,0.02,0.1,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
export const playDock = () => zzfx(1,0.05,800,0.05,0.05,0.1,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
export const playFall = () => zzfx(1,0.2,400,0,0.2,0.3,1,1,-5,0,0,0,0,0,0,0,0,1,0,0)
export const playWin = () => {
  zzfx(1,0.1,600,0.05,0.05,0.1,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
  setTimeout(() => zzfx(1,0.1,800,0.05,0.05,0.2,0,1,0,0,0,0,0,0,0,0,0,1,0,0), 150)
  setTimeout(() => zzfx(1,0.1,1200,0.1,0.1,0.3,0,1,0,0,0,0,0,0,0,0,0,1,0,0), 300)
}
export const playMenuSelect = () => zzfx(0.5,0.05,600,0,0,0.02,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
export const playMenuConfirm = () => zzfx(1,0.05,900,0,0.05,0.05,0,1,0,0,0,0,0,0,0,0,0,1,0,0)

let master: GainNode | null = null
// Renamed from 'cartcrate_muted' (#104); carry the old setting across.
migrateKey('cartcrate_muted', 'cart_crate_muted')
let muted = localStorage.getItem('cart_crate_muted') === '1'

export function ensureCtx(): AudioContext | null {
  zzfxInit()
  if (!zzfxX) return null
  if (!master) {
    master = zzfxX.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(zzfxX.destination)
  }
  return zzfxX
}

export function isMuted(): boolean { return muted }
export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem('cart_crate_muted', m ? '1' : '0')
  if (master) master.gain.value = m ? 0 : 1
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
  g.gain.linearRampToValueAtTime(vol, at + 0.05)
  g.gain.exponentialRampToValueAtTime(0.001, at + dur * 0.95)
  osc.start(at)
  osc.stop(at + dur)
}

type MNote = { f: number; d: number }
const LEAD: MNote[] = [
  { f: 392, d: 0.5 }, { f: 440, d: 0.25 }, { f: 493.88, d: 0.75 }, { f: 0, d: 0.5 },
  { f: 329.63, d: 0.5 }, { f: 392, d: 0.25 }, { f: 440, d: 0.75 }, { f: 0, d: 0.5 }
]
const BASS: MNote[] = [
  { f: 196, d: 0.5 }, { f: 0, d: 0.5 }, { f: 164.81, d: 0.5 }, { f: 0, d: 0.5 },
  { f: 146.83, d: 0.5 }, { f: 0, d: 0.5 }, { f: 130.81, d: 0.5 }, { f: 0, d: 0.5 }
]

const TRACKS: Record<string, { lead: OscillatorType; bass: OscillatorType; tempo: number; l: MNote[]; b: MNote[] }> = {
  puzzle: { lead: 'sine', bass: 'triangle', tempo: 0.8, l: LEAD, b: BASS }
}

export const music = {
  play(name: 'puzzle') {
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
        musicNote(n.f, n.d * cfg.tempo, leadT, cfg.lead, 0.08)
        leadT += n.d * cfg.tempo
        leadStep++
      }
      while (bassT < horizon) {
        const n = cfg.b[bassStep % cfg.b.length]
        musicNote(n.f, n.d * cfg.tempo, bassT, cfg.bass, 0.08)
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
