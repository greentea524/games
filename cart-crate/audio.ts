import { migrateKey } from '../shared/storage'

// Cart & Crate's sound (#144).
//
// The effects used to be a hand-copied ZzFX, and they never made a sound: the
// samples reached the player as a one-sample buffer holding NaN. Under that
// were three more faults — a bare sine where volume times envelope belonged,
// an amplitude scaled by the oscillator's running phase, and a route straight
// to `destination` that the mute could not reach. #142's sound check was the
// first thing to listen, and #144 has the measurements.
//
// Rather than repair the port, the effects now use the same small synth the
// other four GameBoy games use: one oscillator, an exponential decay, through
// the master gain. Each is translated from its ZzFX parameter list — pitch,
// attack + sustain + release, wave shape, slide, and ZzFX's +-pitch
// randomness — so the sounds are the ones the lists describe, at a loudness
// that sits with the rest of the collection.

let ctx: AudioContext | null = null
let master: GainNode | null = null
// Renamed from 'cartcrate_muted' (#104); carry the old setting across.
migrateKey('cartcrate_muted', 'cart_crate_muted')
let muted = localStorage.getItem('cart_crate_muted') === '1'

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
  localStorage.setItem('cart_crate_muted', m ? '1' : '0')
  if (master) master.gain.value = m ? 0 : 1
}

/**
 * One effect: an oscillator from `fStart` to `fEnd` over `dur` seconds,
 * decaying from `vol`, through the master gain so the mute reaches it.
 *
 * `jitter` is ZzFX's randomness: the pitch moves by up to that fraction each
 * time, so a sound played on every step of a level does not drone.
 */
function tone(
  type: OscillatorType,
  fStart: number,
  fEnd: number,
  dur: number,
  vol: number,
  { delay = 0, jitter = 0.05 } = {},
) {
  const c = ensureCtx()
  if (!c || !master) return
  const shift = 1 + (Math.random() * 2 - 1) * jitter
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.connect(g)
  g.connect(master)
  const t0 = c.currentTime + delay
  osc.frequency.setValueAtTime(fStart * shift, t0)
  if (fStart !== fEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, fEnd * shift), t0 + dur)
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/**
 * Loudness of a ZzFX volume of 1. Each effect keeps its list's own volume as a
 * multiple of this, so their balance against each other is the one authored.
 *
 * Measured through the QA analyser, peak RMS: at 0.04 the set ran 0.005 (the
 * menu tick, authored at half volume) to 0.023 (the win), with a move at
 * 0.011. The other four games' effects measure 0.013 to 0.036 and this game's
 * music 0.015, so 0.05 puts a move — the sound of every step — at about 0.014,
 * inside that range and under the music.
 */
const VOL = 0.05

// Each line keeps the ZzFX list it replaces, as (volume, randomness, pitch,
// attack, sustain, release, shape, ...). Durations are attack + sustain +
// release, floored at 40 ms: ZzFX's 20 ms blips are a click on a phone
// speaker, if they are anything.

// (1.2, .05, 400, 0, 0, .02) — a short sine blip.
export const playMove = () => tone('sine', 400, 400, 0.04, 1.2 * VOL)
// (1.5, .05, 120, 0, .02, .1) — a low thud. Triangle, not ZzFX's sine: a 120 Hz
// sine is close to inaudible on a phone speaker, and the push is the sound a
// sokoban is about. The triangle's harmonics carry the same pitch.
export const playPush = () => tone('triangle', 120, 120, 0.12, 1.5 * VOL)
// (1, .05, 800, .05, .05, .1) — a bright chime as a crate lands on a target.
export const playDock = () => tone('sine', 800, 800, 0.2, VOL)
// (1, .2, 400, 0, .2, .3, triangle, 1, slide -5) — a falling triangle.
export const playFall = () => tone('triangle', 400, 100, 0.5, VOL, { jitter: 0.2 })
// Three rising chimes, 150 ms apart, each a little longer than the last.
export const playWin = () => {
  tone('sine', 600, 600, 0.2, VOL, { jitter: 0.1 })
  tone('sine', 800, 800, 0.3, VOL, { delay: 0.15, jitter: 0.1 })
  tone('sine', 1200, 1200, 0.5, VOL, { delay: 0.3, jitter: 0.1 })
}
// (.5, .05, 600, 0, 0, .02) — a quiet tick.
export const playMenuSelect = () => tone('sine', 600, 600, 0.04, 0.5 * VOL)
// (1, .05, 900, 0, .05, .05) — a brighter confirm.
export const playMenuConfirm = () => tone('sine', 900, 900, 0.1, VOL)

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
