// audio.ts
// Lightweight Web Audio API synth for 8-bit sound effects

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
let master: GainNode | null = null
let muted = localStorage.getItem('lantern_muted') === '1'

export function ensureCtx() {
  if (audioCtx.state === 'suspended') audioCtx.resume()
  if (!master) {
    master = audioCtx.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(audioCtx.destination)
  }
}

export function isMuted(): boolean { return muted }
export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem('lantern_muted', m ? '1' : '0')
  if (master) master.gain.value = m ? 0 : 1
}

function playTone(
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  vol: number = 0.1
) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.type = type
  osc.connect(gain)
  ensureCtx()
  if (master) gain.connect(master)

  const now = audioCtx.currentTime
  osc.frequency.setValueAtTime(freqStart, now)
  if (freqStart !== freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration)
  }

  gain.gain.setValueAtTime(vol, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + duration)

  osc.start(now)
  osc.stop(now + duration)
}

function playNoise(duration: number, vol: number = 0.1) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  const bufferSize = audioCtx.sampleRate * duration
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const noise = audioCtx.createBufferSource()
  noise.buffer = buffer

  // Simple bandpass filter for "woosh" or "hit" sound
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1000

  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(vol, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration)

  noise.connect(filter)
  filter.connect(gain)
  ensureCtx()
  if (master) gain.connect(master)

  noise.start()
}

export const sfx = {
  jump: () => playTone('square', 150, 300, 0.15, 0.05),
  doubleJump: () => playTone('square', 200, 400, 0.15, 0.05),
  dash: () => playNoise(0.2, 0.15),
  wallKick: () => {
    playTone('square', 100, 50, 0.1, 0.05)
    playNoise(0.1, 0.05)
  },
  land: () => playTone('triangle', 80, 40, 0.1, 0.05),
  lantern: () => playTone('sine', 400, 800, 0.3, 0.1),
  win: () => {
    playTone('square', 400, 400, 0.2, 0.1)
    setTimeout(() => playTone('square', 500, 500, 0.2, 0.1), 200)
    setTimeout(() => playTone('square', 600, 800, 0.4, 0.1), 400)
  },
  die: () => playTone('sawtooth', 200, 50, 0.5, 0.1)
}

let musicBus: GainNode | null = null
let musicTimer: number | null = null
let currentTrack: string | null = null

function bus(): GainNode | null {
  ensureCtx()
  if (!master) return null
  if (!musicBus) {
    musicBus = audioCtx.createGain()
    musicBus.gain.value = 0.3
    musicBus.connect(master)
  }
  return musicBus
}

function musicNote(f: number, dur: number, at: number, wave: OscillatorType, vol: number) {
  if (f === 0) return
  const b = bus()
  if (!b) return
  const osc = audioCtx.createOscillator()
  const g = audioCtx.createGain()
  osc.type = wave
  osc.frequency.value = f
  osc.connect(g)
  g.connect(b)
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(vol, at + 0.05)
  g.gain.exponentialRampToValueAtTime(0.001, at + dur * 0.9)
  osc.start(at)
  osc.stop(at + dur)
}

type MNote = { f: number; d: number }
const LEAD: MNote[] = [
  { f: 523.25, d: 0.125 }, { f: 587.33, d: 0.125 }, { f: 659.25, d: 0.25 },
  { f: 523.25, d: 0.25 }, { f: 783.99, d: 0.25 },
]
const BASS: MNote[] = [
  { f: 130.81, d: 0.25 }, { f: 0, d: 0.25 }, { f: 130.81, d: 0.5 },
]

const TRACKS: Record<string, { lead: OscillatorType; bass: OscillatorType; tempo: number; l: MNote[]; b: MNote[] }> = {
  adventure: { lead: 'square', bass: 'sawtooth', tempo: 0.7, l: LEAD, b: BASS }
}

export const music = {
  play(name: 'adventure') {
    if (currentTrack === name) return
    this.stop()
    const cfg = TRACKS[name]
    if (!cfg) return
    currentTrack = name
    let leadStep = 0, bassStep = 0
    let leadT = audioCtx.currentTime + 0.1
    let bassT = audioCtx.currentTime + 0.1
    const tick = () => {
      if (currentTrack !== name) return
      const horizon = audioCtx.currentTime + 0.25
      while (leadT < horizon) {
        const n = cfg.l[leadStep % cfg.l.length]
        musicNote(n.f, n.d * cfg.tempo, leadT, cfg.lead, 0.06)
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
