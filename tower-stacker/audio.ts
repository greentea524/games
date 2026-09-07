// Tower Stacker's noises, synthesised rather than loaded (#110).
//
// #110 calls the drop's weight the hard part, and half of that weight is the
// sound: a landing with no thud reads as a sprite moving, not a slab arriving.
// Everything here is a few oscillator seconds, so the game ships no audio
// files and the CSP needs no `media-src` beyond the `data:`/`blob:` it already
// grants.
//
// Browsers only allow an AudioContext to start from a user gesture, so
// `ensureCtx` is called from the first press rather than at module load.

let ctx: AudioContext | null = null
let muted = false

/** Creates or resumes the context. Safe to call on every press. */
export function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    // A blocked or unavailable context must cost the sound, not the run.
    return null
  }
}

export function setMuted(next: boolean): void {
  muted = next
}

export function isMuted(): boolean {
  return muted
}

/** One enveloped oscillator. `type` and the pitch sweep are the whole character. */
function tone(
  freq: number,
  endFreq: number,
  durationMs: number,
  type: OscillatorType,
  gain: number,
): void {
  if (muted) return
  const ac = ensureCtx()
  if (!ac) return
  const now = ac.currentTime
  const dur = durationMs / 1000
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + dur)
  // A hard stop clicks. The short attack and exponential tail are what make
  // these read as a chiptune rather than as a fault.
  amp.gain.setValueAtTime(0.0001, now)
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}

/** A slab landing. Low, short, and with a click of noise on top for the impact. */
export function playLand(level: number): void {
  // Rises slightly with height so a tall tower sounds like one.
  const base = 96 + Math.min(level, 24) * 2.5
  tone(base, base * 0.55, 150, 'square', 0.22)
  tone(base * 4, base * 2, 55, 'triangle', 0.09)
}

/** A perfect drop. The one sound the game wants the player chasing. */
export function playPerfect(streak: number): void {
  // Climbs with the streak, so a run of them builds rather than repeats.
  const step = Math.min(streak, 7)
  const root = 523.25 * Math.pow(2, step / 12)
  tone(root, root, 90, 'square', 0.16)
  window.setTimeout(() => tone(root * 1.5, root * 1.5, 130, 'square', 0.14), 70)
}

/** The run ending. */
export function playMiss(): void {
  tone(220, 55, 550, 'sawtooth', 0.18)
}

/** Menu movement and confirmations. */
export function playBlip(): void {
  tone(660, 880, 60, 'square', 0.12)
}
