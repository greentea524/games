import { migrateKey } from '../shared/storage'

let ctx: AudioContext | null = null
let master: GainNode | null = null

// Renamed from 'pd_muted' (#104); carry the old setting across.
migrateKey('pd_muted', 'pocket_dungeon_muted')
let muted = localStorage.getItem('pocket_dungeon_muted') === '1'

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
  localStorage.setItem('pocket_dungeon_muted', m ? '1' : '0')
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
  menuMove: () => tone('square', 440, 440, 0.05, 0.04),
  menuSelect: () => tone('square', 520, 780, 0.08, 0.05),
  menuCancel: () => tone('square', 400, 300, 0.08, 0.05),
  attack: () => tone('sawtooth', 300, 150, 0.08, 0.06),
  // #60: a reviving Bonepile. Rising, and unlike `hit`, so the player can
  // tell "it got back up" from "I hit something" without looking.
  revive: () => {
    tone('square', 90, 200, 0.18, 0.07)
    tone('square', 140, 280, 0.2, 0.06, 0.11)
  },
  hit: () => noise(0.15, 0.1, 400),
  pickup: () => {
    tone('square', 520, 520, 0.09, 0.06)
    tone('square', 780, 780, 0.12, 0.06, 0.09)
  },
  stairs: () => {
    tone('triangle', 600, 300, 0.2, 0.06)
    tone('triangle', 300, 150, 0.2, 0.06, 0.1)
  }
}

type MNote = { f: number; d: number }
const LEAD_DUNGEON: MNote[] = [
  { f: 220, d: 0.25 }, { f: 246.9, d: 0.25 }, { f: 261.6, d: 0.5 },
  { f: 220, d: 0.25 }, { f: 196, d: 0.25 }, { f: 164.8, d: 0.5 },
]
const BASS_DUNGEON: MNote[] = [
  { f: 110, d: 0.5 }, { f: 110, d: 0.5 }, { f: 98, d: 0.5 }, { f: 82.4, d: 0.5 }
]

const LEAD_TITLE: MNote[] = [
  { f: 164.8, d: 0.8 }, { f: 196, d: 0.8 }, { f: 220, d: 1.6 },
  { f: 196, d: 0.8 }, { f: 146.8, d: 0.8 }, { f: 164.8, d: 1.6 }
]
const BASS_TITLE: MNote[] = [
  { f: 82.4, d: 1.6 }, { f: 110, d: 1.6 },
  { f: 73.4, d: 1.6 }, { f: 82.4, d: 1.6 }
]

const LEAD_BOSS: MNote[] = [
  { f: 329.6, d: 0.15 }, { f: 392, d: 0.15 }, { f: 440, d: 0.15 }, { f: 493.9, d: 0.15 },
  { f: 440, d: 0.15 }, { f: 392, d: 0.15 }, { f: 329.6, d: 0.3 }
]
const BASS_BOSS: MNote[] = [
  { f: 164.8, d: 0.15 }, { f: 164.8, d: 0.15 }, { f: 196, d: 0.15 }, { f: 196, d: 0.15 },
  { f: 220, d: 0.3 }, { f: 164.8, d: 0.3 }
]

const TRACKS: Record<string, { lead: OscillatorType; bass: OscillatorType; tempo: number; l: MNote[]; b: MNote[] }> = {
  title: { lead: 'sine', bass: 'triangle', tempo: 1, l: LEAD_TITLE, b: BASS_TITLE },
  dungeon: { lead: 'square', bass: 'sawtooth', tempo: 0.9, l: LEAD_DUNGEON, b: BASS_DUNGEON },
  boss: { lead: 'sawtooth', bass: 'square', tempo: 1.2, l: LEAD_BOSS, b: BASS_BOSS }
}

let musicBus: GainNode | null = null
let musicTimer: number | null = null
let currentTrack: string | null = null

function bus(): GainNode | null {
  const c = ensureCtx()
  if (!c || !master) return null
  if (!musicBus) {
    musicBus = c.createGain()
    musicBus.gain.value = 0.4
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
  play(name: 'title' | 'dungeon' | 'boss') {
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
        const n = cfg.l[leadStep % cfg.l.length]
        musicNote(n.f, n.d * cfg.tempo, leadT, cfg.lead, 0.05)
        leadT += n.d * cfg.tempo
        leadStep++
      }
      while (bassT < horizon) {
        const n = cfg.b[bassStep % cfg.b.length]
        musicNote(n.f, n.d * cfg.tempo, bassT, cfg.bass, 0.035)
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
